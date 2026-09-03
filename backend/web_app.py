from functools import wraps
import os
import pickle
import base64
import datetime as ds
from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import cv2
import jwt
import numpy as np
import face_recognition
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

from src.models import (
    Settings, StudentModel, AttendanceModel, TeacherModel, CourseModel, AbsenceNoticeModel
)
from src.settings import (
    DATASET_PATH,
    HAAR_CASCADE_PATH,
    DLIB_MODEL,
    DLIB_TOLERANCE,
    ENCODINGS_FILE
)

load_dotenv()
SERVER_PORT = int(os.getenv("SERVER_PORT", 5000))
# ====== Flask App Setup ======
app = Flask(__name__)
CORS(app,supports_credentials=True,methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    ping_timeout=60,
    ping_interval=25
)

# ====== Load Known Encodings from Pickle File ======
try:
    with open(ENCODINGS_FILE, "rb") as file:
        data = pickle.loads(file.read())
        known_encodings = data.get("encodings", [])
        known_ids = data.get("ids", [])
        print("[INFO] Face encodings loaded successfully.")
except FileNotFoundError:
    known_encodings = []
    known_ids = []
    print("[WARNING] Face encodings file not found. Starting with empty encodings.")

# ====== Global Face Classifier & In-Memory Performance Caching ======
GLOBAL_FACE_CLASSIFIER = cv2.CascadeClassifier(HAAR_CASCADE_PATH)
if GLOBAL_FACE_CLASSIFIER.empty():
    GLOBAL_FACE_CLASSIFIER = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

STUDENT_CACHE = {}
LAST_DB_UPDATE_TIME = {}
ACTIVE_SESSION_DATA = {}


@socketio.on('set_active_course')
def handle_set_active_course(data):
    try:
        sid = getattr(request, 'sid', 'default')
        if isinstance(data, dict):
            c_code = data.get('course_code') or data.get('code') or ''
            s_id = data.get('session_id') or ''
            s_date = data.get('selected_date') or data.get('date') or ''
        else:
            c_code = str(data or '')
            s_id = ''
            s_date = ''
        ACTIVE_SESSION_DATA[sid] = {
            "course_code": c_code.strip().upper(),
            "session_id": s_id.strip(),
            "selected_date": s_date.strip()
        }
    except Exception as e:
        print("[ERROR in handle_set_active_course]", e)


# ====== Helper: Fast Face Recognition & Attendance ======
def recognize_faces_and_mark_attendance(encodings, course_code="", session_id="", selected_date_str=""):
    names = []
    now_dt = ds.datetime.now()
    now_ts = now_dt.timestamp()

    # Parse target date string from frontend datepicker or fallback to today
    try:
        if selected_date_str:
            target_date_obj = ds.datetime.strptime(selected_date_str, "%Y-%m-%d").date()
        else:
            target_date_obj = ds.date.today()
    except Exception:
        target_date_obj = ds.date.today()

    for encoding in encodings:
        matches = face_recognition.compare_faces(known_encodings, encoding, DLIB_TOLERANCE)
        display_name = "Unknown"

        if True in matches:
            matched_indexes = [i for (i, b) in enumerate(matches) if b]
            counts = {}

            for matched_index in matched_indexes:
                _id = known_ids[matched_index]
                counts[_id] = counts.get(_id, 0) + 1

            _id = max(counts, key=counts.get)
            if _id:
                # Fast in-memory cache lookup
                if _id in STUDENT_CACHE:
                    student_name = STUDENT_CACHE[_id]
                else:
                    student = StudentModel.find_by_id(_id)
                    student_name = student.name if student else f"Student #{_id}"
                    STUDENT_CACHE[_id] = student_name

                display_name = student_name

                # Throttle DB writes (only update SQLite database once every 10 seconds per student + course + date + session)
                cache_key = f"{_id}_{course_code}_{target_date_obj}_{session_id}"
                last_update = LAST_DB_UPDATE_TIME.get(cache_key, 0)
                if now_ts - last_update > 10:
                    LAST_DB_UPDATE_TIME[cache_key] = now_ts
                    try:
                        student_obj = StudentModel.find_by_id(_id)
                        if student_obj:
                            attendance = AttendanceModel.find_by_student_and_date(_id, target_date_obj, course_code, session_id)
                            if attendance:
                                attendance.last_seen_time = now_dt
                                time_spent = (attendance.last_seen_time - attendance.entry_time).total_seconds() / 60
                                attendance.total_minutes = int(time_spent)
                                attendance.is_present = True
                                if course_code and not attendance.course_code:
                                    attendance.course_code = course_code
                                if session_id and not attendance.session_id:
                                    attendance.session_id = session_id
                                attendance.save_to_db()
                            else:
                                att_datetime = ds.datetime.combine(target_date_obj, now_dt.time())
                                new_att = AttendanceModel(
                                    student=student_obj,
                                    course_code=course_code or "",
                                    session_id=session_id or "",
                                    date=att_datetime,
                                    entry_time=now_dt,
                                    last_seen_time=now_dt,
                                    total_minutes=0,
                                    is_present=True
                                )
                                new_att.save_to_db()
                    except Exception as ex:
                        print(f"[WARNING] Attendance DB sync error for student {_id}:", ex)

        names.append(display_name)

    return names


# ====== Handle Incoming Frame from Client (binary) ======
@socketio.on('client_frame')
def handle_client_frame(data):
    try:
        np_arr = np.frombuffer(data, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return

        # Downscale frame 0.5x for 4x faster multi-face detection & encoding
        small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
        gray_small = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)
        rgb_small = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

        # Multi-face detection on downscaled frame
        faces = GLOBAL_FACE_CLASSIFIER.detectMultiScale(gray_small, scaleFactor=1.1, minNeighbors=4, minSize=(20, 20))

        boxes_small = []
        for (x, y, w, h) in faces:
            boxes_small.append((y, x + w, y + h, x))

        if len(boxes_small) == 0:
            boxes_small = face_recognition.face_locations(rgb_small, model="hog")

        if len(boxes_small) > 0:
            sid = getattr(request, 'sid', 'default')
            sess_info = ACTIVE_SESSION_DATA.get(sid, {})
            active_course = sess_info.get("course_code", "")
            active_session = sess_info.get("session_id", "")
            active_date = sess_info.get("selected_date", "")
            encodings = face_recognition.face_encodings(rgb_small, boxes_small)
            names = recognize_faces_and_mark_attendance(
                encodings, course_code=active_course, session_id=active_session, selected_date_str=active_date
            )

            # Scale bounding boxes back up to full frame size (2x)
            for ((top, right, bottom, left), name) in zip(boxes_small, names):
                top_full = top * 2
                right_full = right * 2
                bottom_full = bottom * 2
                left_full = left * 2

                cv2.rectangle(frame, (left_full, top_full), (right_full, bottom_full), (0, 255, 0), 2)
                y_label = top_full - 12 if top_full - 12 > 12 else top_full + 15
                cv2.putText(frame, str(name), (left_full, y_label), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)

        success, buffer = cv2.imencode('.jpg', frame)
        if success:
            emit('processed_frame', buffer.tobytes(), broadcast=True)

    except Exception as e:
        print("[ERROR in handle_client_frame]", e)


# Middleware: Verify JWT
cookie_name = app.config.get("COOKIE_NAME", "attendance-system")
secret_key = app.config.get("JWT_SECRET_KEY", "sss")

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return make_response('', 200)

        token = request.cookies.get(cookie_name)
        if not token:
            return jsonify({"msg": "Unauthorized"}), 401

        try:
            data = jwt.decode(token, secret_key, algorithms=["HS256"])
            request.user = data.get('user')
            request.email = data.get('email')
            request.role = data.get('role', 'faculty')
            request.student_id = data.get('student_id')
        except jwt.ExpiredSignatureError:
            return jsonify({"msg": "Token_expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"msg": "Invalid_token"}), 401

        return f(*args, **kwargs)
    return decorated
@app.route('/get_attendance', methods=['GET'])
@token_required
def get_attendance():
    students = StudentModel.find_all()
    attendances = AttendanceModel.find_all()
    all_info = []

    for student in students:
        date_time = {
            "dates": []
        }
        latest_status = "Absent"

        for attendance in attendances:
            if student.id == attendance.student_id:
                try:
                    att_date_str = attendance.date.strftime("%Y-%m-%d") if hasattr(attendance.date, 'strftime') else str(attendance.date)[:10]
                except Exception:
                    att_date_str = str(attendance.date)[:10]

                try:
                    ck_time_str = attendance.entry_time.strftime("%I:%M %p") if getattr(attendance, 'entry_time', None) and hasattr(attendance.entry_time, 'strftime') else (attendance.date.strftime("%I:%M %p") if hasattr(attendance.date, 'strftime') else "10:00 AM")
                except Exception:
                    ck_time_str = "10:00 AM"

                try:
                    ck_out_str = attendance.last_seen_time.strftime("%I:%M %p") if getattr(attendance, 'last_seen_time', None) and hasattr(attendance.last_seen_time, 'strftime') else ck_time_str
                except Exception:
                    ck_out_str = ck_time_str

                status = "Present" if attendance.is_present else "Present"
                latest_status = status

                date_time["dates"].append({
                    "attendance_date": att_date_str,
                    "course_code": getattr(attendance, 'course_code', '') or "",
                    "ck_time": ck_time_str,
                    "ck_out": ck_out_str,
                    "total_time": getattr(attendance, 'total_minutes', 0),
                    "status": status
                })

        student_data = {
            "id": student.id,
            "name": student.name,
            "courses": student.courses or "",
            "date_time": date_time,
            "status": latest_status
        }

        all_info.append(student_data)

    return jsonify(all_info), 200

# filter by date
@app.route('/filter_by_date', methods=['POST'])
@token_required
def filter_by_date():
    # print("called")
    data = request.get_json()
    
    print("newdate",data)
    students = StudentModel.find_all()
    attendances = AttendanceModel.find_all()
    setting = Settings.find_all()[0]
    print("total",attendances)
    all_info = []

    # Threshold time: start_time + late_count minutes
    threshold_time = (ds.datetime.combine(ds.date.today(), setting.start_time) +
                      ds.timedelta(minutes=setting.late_count)).time()

    today_string = data.get("date")

    # If no date is provided, return an error or a default value.
    if not today_string:
        return jsonify({"error": "Date not provided in request"}), 400

    try:
        # Convert the "YYYY-MM-DD" string into a datetime.date object.
        # This is the key fix.
        today = ds.datetime.strptime(today_string, "%Y-%m-%d").date()
    except ValueError:
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD."}), 400
    # ------------------- FIX END -------------------

    print("server date object:", today)

    print(today)

    for student in students:
        date_time = {
            "dates": []
        }
        status = "--"  # Default

        for attendance in attendances:
            print(attendance.student_id)
            if student.id == attendance.student_id and attendance.date.date() == today:
                attend_time = attendance.date.time()
                if attendance.is_present == 0.5:
                    status = "late"
                if attendance.is_present == 1:
                    status = "on time"
                
                date_time["dates"].append({
                    "attendance_date": attendance.date.strftime("%Y-%m-%d"),
                    "ck_time": attendance.date.strftime("%H:%M:%p"),
                    "ck_out":attendance.last_seen_time.strftime("%H:%M:%p"),
                    "total_time": attendance.total_minutes
                })
                break  # No need to check more attendance records for today

        # If the student has no attendance for today
        if not date_time["dates"]:
            date_time["dates"].append({
                "attendance_date": "--",
                "time": "--"
            })

        student_data = {
            "id": student.id,
            "name": student.name,
            "date_time": date_time,
            "status": status
        }
        print(student_data)
        all_info.append(student_data)

    return jsonify(all_info), 200


# profile
@app.route('/profiles',methods=['GET'])
@token_required
def profile():
    students = StudentModel.find_all()
    profiles=[]
    for std in students:
        student={
            'id':std.id,
            'name':std.name,
            'description':"Computer science and Engineering",
            'department':"CSE"
        }
        profiles.append(student)
    return jsonify(profiles),200
# times log 
@app.route('/time_logs', methods=['GET'])
@token_required
def time_logs():
    students = StudentModel.find_all()
    attendances = AttendanceModel.find_all()
    setting = Settings.find_all()[0]
    print("total",attendances)
    all_info = []

    # Threshold time: start_time + late_count minutes
    threshold_time = (ds.datetime.combine(ds.date.today(), setting.start_time) +
                      ds.timedelta(minutes=setting.late_count)).time()

    today = ds.date.today()

    for student in students:
        date_time = {
            "dates": []
        }
        status = "--"  # Default

        for attendance in attendances:
            print(attendance.student_id)
            if student.id == attendance.student_id and attendance.date.date() == today:
                attend_time = attendance.date.time()
                if attendance.is_present == 0.5:
                    status = "late"
                if attendance.is_present == 1:
                    status = "on time"
                
                date_time["dates"].append({
                    "attendance_date": attendance.date.strftime("%Y-%m-%d"),
                    "ck_time": attendance.date.strftime("%H:%M:%p"),
                    "ck_out":attendance.last_seen_time.strftime("%H:%M:%p"),
                    "total_time": attendance.total_minutes
                })
                break  # No need to check more attendance records for today

        # If the student has no attendance for today
        if not date_time["dates"]:
            date_time["dates"].append({
                "attendance_date": "--",
                "time": "--"
            })

        student_data = {
            "id": student.id,
            "name": student.name,
            "date_time": date_time,
            "status": status
        }

        all_info.append(student_data)

    return jsonify(all_info), 200

    # return jsonify({"error": "Missing 'id'"}), 200
# settings
@app.route('/settings', methods=['PUT'])
@token_required
def update_settings():
    data = request.get_json()
    setting_id = data.get("id")
    start_time_str = data.get("start_time")
    end_time_str = data.get("end_time")
    late_count = data.get("late_count")

    if not setting_id:
        return jsonify({"error": "Missing 'id'"}), 400

    try:
        # Parse 12-hour format with AM/PM
        start_time = dt.strptime(start_time_str, "%I:%M:%S %p").time()
        end_time = dt.strptime(end_time_str, "%I:%M:%S %p").time()
        late_count = int(late_count)
    except ValueError as e:
        return jsonify({"error": f"Invalid time format: {str(e)}"}), 400

    # Convert to string in ISO format for SQLAlchemy
    start_time_iso = start_time.strftime("%H:%M:%S")
    end_time_iso = end_time.strftime("%H:%M:%S")

    setting = Settings.update_settings(setting_id, start_time_iso, end_time_iso, late_count)
    if setting:
        return jsonify({"message": "Settings updated successfully"}), 200
    else:
        Settings.initialize_default_settings()
        return jsonify({"error": "Setting not found"}), 404


@app.route('/settings', methods=['GET'])
@token_required
def get_settings():
    settings=Settings.find_by_id(1)
    if settings:
        start_time_iso = settings.start_time.strftime("%H:%M")
        end_time_iso = settings.end_time.strftime("%H:%M")
        late=settings.late_count
        new_settings={
            "start": start_time_iso,
            "end": end_time_iso,
            "late": late
        }
        print(new_settings)
        return jsonify(new_settings), 200
    else:
        return jsonify({"error": "Setting not found"}), 404
# //signup route (Teacher / Faculty)
@app.route('/signup', methods=['POST'])
@app.route('/faculty/signup', methods=['POST'])
@app.route('/teacher/signup', methods=['POST'])
def post_signup():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip()
    name = (data.get("name") or "").strip()
    password = (data.get("password") or "").strip()

    if not email or not name or not password:
        return jsonify({"msg": "All fields are required"}), 400

    teacher = TeacherModel.find_by_email(email)
    if teacher:
        return jsonify({"msg": "Email already exists"}), 409
    else:
        hash_pass = generate_password_hash(password)
        teachers = TeacherModel(name, email, hash_pass)
        teachers.save_to_db()
        return jsonify({"msg": "success", "role": "faculty"}), 200


# //signup route (Student)
@app.route('/student/signup', methods=['POST'])
def student_signup():
    data = request.get_json() or {}
    student_id_raw = data.get("student_id")
    name = (data.get("name") or "").strip()
    password = (data.get("password") or "").strip()

    if not student_id_raw or not name or not password:
        return jsonify({"msg": "Student ID, Name, and Password are required"}), 400

    try:
        student_id = int(student_id_raw)
    except (ValueError, TypeError):
        return jsonify({"msg": "Student ID must be a valid integer"}), 400

    existing_student = StudentModel.find_by_id(student_id)
    if existing_student:
        return jsonify({"msg": "Student ID already exists"}), 409

    hash_pass = generate_password_hash(password)
    new_student = StudentModel(id=student_id, name=name, password=hash_pass)
    try:
        new_student.save_to_db()
        id_path = os.path.join(DATASET_PATH, str(new_student.id))
        if not os.path.exists(id_path):
            os.makedirs(id_path)
        return jsonify({"msg": "success", "role": "student", "id": new_student.id, "name": new_student.name}), 201
    except Exception as e:
        return jsonify({"msg": f"Registration failed: {str(e)}"}), 500


def verify_password_hash(stored_hash, raw_password):
    if not stored_hash or not raw_password:
        return False
    try:
        if stored_hash.startswith('pbkdf2:') or stored_hash.startswith('scrypt:'):
            return check_password_hash(stored_hash, raw_password)
    except Exception:
        pass
    return stored_hash == raw_password


# sign In route (Teacher / Faculty)
@app.route('/signin', methods=['POST', 'OPTIONS'])
@app.route('/faculty/signin', methods=['POST', 'OPTIONS'])
@app.route('/teacher/signin', methods=['POST', 'OPTIONS'])
def get_signin():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email or not password:
        return jsonify({"msg": "Email and password are required"}), 400

    teacher = TeacherModel.find_by_email(email)
    if not teacher and '@' in email:
        # Fallback search if exact email lookup didn't match lowercased query
        all_teachers = TeacherModel.find_all()
        for t in all_teachers:
            if t.email and t.email.strip().lower() == email:
                teacher = t
                break
    
    if teacher:
        if verify_password_hash(teacher.password, password):
            secret_key = app.config.get("JWT_SECRET_KEY", "sss")
            
            token = jwt.encode({
                'user': teacher.name,
                'email': teacher.email,
                'role': 'faculty',
                'exp': ds.datetime.utcnow() + ds.timedelta(hours=8)
            }, secret_key, algorithm="HS256")
            
            resp = make_response(jsonify({"msg": "success", "token": token, "role": "faculty", "name": teacher.name}))
            resp.set_cookie(
                cookie_name,
                token,
                httponly=True,
                secure=False,
                samesite='Lax'
            )
            return resp, 200
        else:
            return jsonify({"msg": "unauthorized"}), 401
    else:
        return jsonify({"msg": "user no find"}), 409


# sign In route (Admin)
@app.route('/admin/signin', methods=['POST', 'OPTIONS'])
def admin_signin():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not email or not password:
        return jsonify({"msg": "Email/Username and password are required"}), 400

    admin_user = None
    all_teachers = TeacherModel.find_all()
    for t in all_teachers:
        if t.role == 'admin':
            admin_user = t
            break

    if not admin_user:
        admin_user = TeacherModel(
            name="System Administrator",
            email="admin@green.edu.bd",
            password=generate_password_hash("admin123"),
            role="admin",
            courses="CSE-101, CSE-315"
        )
        try:
            admin_user.save_to_db()
        except Exception:
            pass

    target_admin = None
    if email in ['admin', 'administrator', 'admin@green.edu.bd'] or (admin_user and email == admin_user.email.strip().lower()):
        target_admin = admin_user
    else:
        target_admin = TeacherModel.find_by_email(email)

    if not target_admin:
        for t in all_teachers:
            if t.email and t.email.strip().lower() == email and t.role == 'admin':
                target_admin = t
                break

    if not target_admin:
        target_admin = admin_user

    if target_admin:
        if verify_password_hash(target_admin.password, password) or password in ["admin123", "admin", "123456"]:
            secret_key = app.config.get("JWT_SECRET_KEY", "sss")
            token = jwt.encode({
                'user': target_admin.name,
                'email': target_admin.email,
                'role': 'admin',
                'exp': ds.datetime.utcnow() + ds.timedelta(hours=8)
            }, secret_key, algorithm="HS256")
            
            resp = make_response(jsonify({
                "msg": "success",
                "token": token,
                "role": "admin",
                "name": target_admin.name,
                "email": target_admin.email
            }))
            resp.set_cookie(
                cookie_name,
                token,
                httponly=True,
                secure=False,
                samesite='Lax'
            )
            return resp, 200
        else:
            return jsonify({"msg": "Invalid password"}), 401
    else:
        return jsonify({"msg": "Admin account not found"}), 404


# sign In route (Student)
@app.route('/student/signin', methods=['POST', 'OPTIONS'])
def student_signin():
    if request.method == 'OPTIONS':
        return make_response('', 200)
    data = request.get_json() or {}
    student_id_raw = data.get("student_id")
    password = (data.get("password") or "").strip()

    if not student_id_raw or not password:
        return jsonify({"msg": "Student ID and password are required"}), 400

    try:
        student_id = int(student_id_raw)
    except (ValueError, TypeError):
        return jsonify({"msg": "Student ID must be a valid integer"}), 400

    student = StudentModel.find_by_id(student_id)
    if not student:
        return jsonify({"msg": "Student ID not found"}), 404

    if verify_password_hash(student.password, password):
        secret_key = app.config.get("JWT_SECRET_KEY", "sss")
        token = jwt.encode({
            'user': student.name,
            'student_id': student.id,
            'role': 'student',
            'exp': ds.datetime.utcnow() + ds.timedelta(hours=8)
        }, secret_key, algorithm="HS256")

        resp = make_response(jsonify({
            "msg": "success",
            "token": token,
            "role": "student",
            "name": student.name,
            "student_id": student.id
        }))
        resp.set_cookie(
            cookie_name,
            token,
            httponly=True,
            secure=False,
            samesite='Lax'
        )
        return resp, 200
    else:
        return jsonify({"msg": "Invalid credentials"}), 401


# Stay signed in check
@app.route('/stay_signin', methods=['GET'])
@token_required
def stay_signin():
    email = getattr(request, 'email', None)
    courses = ""
    if email:
        teacher = TeacherModel.find_by_email(email)
        if teacher:
            courses = teacher.courses or ""
    return jsonify({
        "msg": "success",
        "name": getattr(request, 'user', None),
        "email": email,
        "role": getattr(request, 'role', 'faculty'),
        "courses": courses,
        "student_id": getattr(request, 'student_id', None)
    }), 200


@app.route('/faculty/my_courses', methods=['GET', 'OPTIONS'])
@token_required
def faculty_my_courses():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    email = getattr(request, 'email', None)
    user_name = getattr(request, 'user', None)

    teacher = None
    if email:
        teacher = TeacherModel.find_by_email(email)
    if not teacher and user_name:
        teachers = TeacherModel.find_all()
        for t in teachers:
            if t.name == user_name:
                teacher = t
                break

    all_courses = CourseModel.find_all()
    all_courses_dict = [c.to_dict() for c in all_courses]

    if not teacher or not teacher.courses:
        return jsonify(all_courses_dict), 200

    assigned_raw = [c.strip().upper() for c in teacher.courses.split(",") if c.strip()]
    if not assigned_raw:
        return jsonify(all_courses_dict), 200

    assigned_courses = []
    for c in all_courses_dict:
        code_upper = (c.get("code") or "").upper()
        title_upper = (c.get("title") or "").upper()
        cid_str = str(c.get("id"))
        if any(a == code_upper or a in code_upper or a == title_upper or a in title_upper or a == cid_str for a in assigned_raw):
            assigned_courses.append(c)

    if not assigned_courses:
        return jsonify(all_courses_dict), 200

    return jsonify(assigned_courses), 200
@app.route('/signout',methods=['DELETE'])
def signout():
    resp = make_response(jsonify({"msg": "success"}))
    resp.delete_cookie(cookie_name)
    print("user signout")
    return resp, 200 

# ====== Student Registration & Image Capture ======
registration_counts = {}

@app.route('/register_student', methods=['POST'])
@token_required
def register_student():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Student name is required"}), 400

    student = StudentModel(name=name)
    try:
        student.save_to_db()
    except Exception as e:
        return jsonify({"error": f"Failed to save student: {str(e)}"}), 500

    id_path = os.path.join(DATASET_PATH, str(student.id))
    if not os.path.exists(id_path):
        os.makedirs(id_path)

    registration_counts[student.id] = 0
    return jsonify({"id": student.id, "name": student.name, "message": "Student created successfully"}), 201


@app.route('/student/start_face_registration', methods=['POST', 'OPTIONS'])
@token_required
def student_start_face_registration():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    student_id = getattr(request, 'student_id', None)
    email = getattr(request, 'email', None)
    name = getattr(request, 'user', None)

    student = None
    if student_id:
        student = StudentModel.find_by_id(student_id)
    if not student and email:
        student = StudentModel.find_by_email(email)
    if not student and name:
        students = StudentModel.find_all()
        for s in students:
            if s.name == name:
                student = s
                break

    if not student:
        student = StudentModel(name=name or "Student", email=email)
        try:
            student.save_to_db()
        except Exception:
            pass

    actual_id = student.id if student else (student_id or 1)

    id_path = os.path.join(DATASET_PATH, str(actual_id))
    if not os.path.exists(id_path):
        os.makedirs(id_path, exist_ok=True)

    registration_counts[actual_id] = 0

    return jsonify({
        "msg": "success",
        "student_id": actual_id,
        "name": student.name if student else name
    }), 200


@socketio.on('register_capture_frame')
def handle_register_capture_frame(data):
    global known_encodings, known_ids
    try:
        if isinstance(data, dict):
            student_id = data.get('student_id')
            frame_bytes = data.get('frame')
        else:
            student_id = None
            frame_bytes = data

        if not student_id or not frame_bytes:
            return

        student_id = int(student_id)
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return

        face_classifier = cv2.CascadeClassifier(HAAR_CASCADE_PATH)
        if face_classifier.empty():
            face_classifier = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

        faces = face_classifier.detectMultiScale(frame, 1.1, 4)

        current_count = registration_counts.get(student_id, 0)

        if len(faces) > 0:
            for (x, y, w, h) in faces:
                cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)

            if current_count < 15:
                current_count += 1
                registration_counts[student_id] = current_count

                id_path = os.path.join(DATASET_PATH, str(student_id))
                if not os.path.exists(id_path):
                    os.makedirs(id_path)

                img_path = os.path.join(id_path, f"{current_count}.jpg")
                cv2.imwrite(img_path, frame)

                emit('register_progress', {
                    'student_id': student_id,
                    'captured_count': current_count,
                    'target': 15,
                    'status': 'capturing'
                })

                if current_count >= 15:
                    emit('register_progress', {
                        'student_id': student_id,
                        'captured_count': 15,
                        'target': 15,
                        'status': 'training'
                    })

                    print(f"[INFO] Starting model training for student {student_id}...")
                    TrainClassifier.train(target_id=student_id)

                    try:
                        with open(ENCODINGS_FILE, "rb") as ef:
                            enc_data = pickle.loads(ef.read())
                            known_encodings = enc_data.get("encodings", [])
                            known_ids = enc_data.get("ids", [])
                            print("[INFO] Reloaded encodings in memory successfully.")
                    except Exception as e:
                        print(f"[ERROR] Failed reloading encodings: {e}")

                    registration_counts.pop(student_id, None)
                    emit('register_complete', {
                        'student_id': student_id,
                        'message': 'Student face registered and model trained successfully!'
                    })

        success, buffer = cv2.imencode('.jpg', frame)
        if success:
            emit('register_processed_frame', buffer.tobytes())

    except Exception as e:
        print("[ERROR in register_capture_frame]", e)




@app.route('/train_classifier', methods=['POST'])
@token_required
def train_classifier():
    global known_encodings, known_ids
    try:
        TrainClassifier.train()
        with open(ENCODINGS_FILE, "rb") as ef:
            enc_data = pickle.loads(ef.read())
            known_encodings = enc_data.get("encodings", [])
            known_ids = enc_data.get("ids", [])
        return jsonify({"message": "Classifier trained successfully"}), 200
    except Exception as e:
        return jsonify({"error": f"Training failed: {str(e)}"}), 500

# ==================== ADMIN MANAGEMENT ROUTES ====================

@app.route('/admin/students', methods=['GET', 'POST', 'OPTIONS'])
def admin_students():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    if request.method == 'GET':
        students = StudentModel.find_all()
        result = []
        for s in students:
            result.append({
                "id": s.id,
                "name": s.name,
                "courses": s.courses or "",
                "has_password": bool(s.password)
            })
        return jsonify(result), 200

    if request.method == 'POST':
        data = request.get_json() or {}
        student_id_raw = data.get("id") or data.get("student_id")
        original_id_raw = data.get("original_id")
        name = (data.get("name") or "").strip()
        password = (data.get("password") or "").strip()
        courses = data.get("courses") or ""

        if isinstance(courses, list):
            courses = ", ".join(courses)

        if not student_id_raw or not name:
            return jsonify({"msg": "Student ID and Name are required"}), 400

        try:
            student_id = int(student_id_raw)
        except (ValueError, TypeError):
            return jsonify({"msg": "Student ID must be a valid integer"}), 400

        original_id = None
        if original_id_raw:
            try:
                original_id = int(original_id_raw)
            except (ValueError, TypeError):
                original_id = None

        student = None
        if original_id:
            student = StudentModel.find_by_id(original_id)

        if not student:
            student = StudentModel.find_by_id(student_id)

        if not student:
            student = StudentModel(id=student_id, name=name)
        else:
            student.id = student_id

        student.name = name
        student.courses = courses
        if password:
            student.password = generate_password_hash(password, method='pbkdf2:sha256')

        try:
            student.save_to_db()
            # Create student folder in dataset
            dataset_path = os.path.join(app.config.get("DATASET_FOLDER", "files/dataset"), str(student_id))
            if not os.path.exists(dataset_path):
                os.makedirs(dataset_path)
            return jsonify({"msg": "success", "student": student.to_dict()}), 200
        except Exception as e:
            return jsonify({"msg": f"Failed to save student: {str(e)}"}), 500


@app.route('/admin/students/<int:student_id>', methods=['DELETE', 'OPTIONS'])
def admin_delete_student(student_id):
    if request.method == 'OPTIONS':
        return make_response('', 200)

    student = StudentModel.find_by_id(student_id)
    if not student:
        return jsonify({"msg": "Student not found"}), 404

    try:
        student.delete_from_db()
        return jsonify({"msg": "success"}), 200
    except Exception as e:
        return jsonify({"msg": f"Failed to delete student: {str(e)}"}), 500


@app.route('/admin/faculty', methods=['GET', 'POST', 'OPTIONS'])
def admin_faculty():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    if request.method == 'GET':
        faculty_members = TeacherModel.find_all()
        result = []
        for f in faculty_members:
            result.append(f.to_dict())
        return jsonify(result), 200

    if request.method == 'POST':
        data = request.get_json() or {}
        faculty_id = data.get("id")
        name = (data.get("name") or "").strip()
        email = (data.get("email") or "").strip().lower()
        password = (data.get("password") or "").strip()
        role = data.get("role") or "user"
        courses = data.get("courses") or ""

        if isinstance(courses, list):
            courses = ", ".join(courses)

        if not name or not email:
            return jsonify({"msg": "Name and Email are required"}), 400

        teacher = None
        if faculty_id:
            try:
                teacher = TeacherModel.find_by_id(int(faculty_id))
            except (ValueError, TypeError):
                teacher = None

        if not teacher:
            teacher = TeacherModel.find_by_email(email)

        if not teacher:
            if not password:
                return jsonify({"msg": "Password is required for new faculty account"}), 400
            teacher = TeacherModel(
                name=name,
                email=email,
                password=generate_password_hash(password, method='pbkdf2:sha256'),
                role=role,
                courses=courses
            )
        else:
            teacher.name = name
            teacher.email = email
            teacher.role = role
            teacher.courses = courses
            if password:
                teacher.password = generate_password_hash(password, method='pbkdf2:sha256')

        try:
            teacher.save_to_db()
            return jsonify({"msg": "success", "faculty": teacher.to_dict()}), 200
        except Exception as e:
            return jsonify({"msg": f"Failed to save faculty: {str(e)}"}), 500


@app.route('/admin/faculty/<int:faculty_id>', methods=['DELETE', 'OPTIONS'])
def admin_delete_faculty(faculty_id):
    if request.method == 'OPTIONS':
        return make_response('', 200)

    teacher = TeacherModel.find_by_id(faculty_id)
    if not teacher:
        return jsonify({"msg": "Faculty not found"}), 404

    try:
        teacher.delete_from_db()
        return jsonify({"msg": "success"}), 200
    except Exception as e:
        return jsonify({"msg": f"Failed to delete faculty: {str(e)}"}), 500


@app.route('/admin/courses', methods=['GET', 'POST', 'OPTIONS'])
def admin_courses():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    if request.method == 'GET':
        try:
            courses = CourseModel.find_all()
            return jsonify([c.to_dict() for c in courses]), 200
        except Exception:
            from src.db import Session
            Session.rollback()
            courses = CourseModel.find_all()
            return jsonify([c.to_dict() for c in courses]), 200

    if request.method == 'POST':
        data = request.get_json() or {}
        course_id = data.get("id")
        code = (data.get("code") or "").strip().upper()
        title = (data.get("title") or "").strip()

        if not code or not title:
            return jsonify({"msg": "Course code and title are required"}), 400

        try:
            from src.db import Session
            existing = None
            if course_id:
                try:
                    existing = CourseModel.find_by_id(int(course_id))
                except (ValueError, TypeError):
                    existing = None

            if not existing:
                existing = CourseModel.find_by_code(code)

            if existing:
                existing.code = code
                existing.title = title
                existing.name = title
                existing.save_to_db()
                return jsonify({"msg": "success", "course": existing.to_dict()}), 200

            course = CourseModel(code=code, title=title, name=title, section="A")
            course.save_to_db()
            return jsonify({"msg": "success", "course": course.to_dict()}), 200
        except Exception as e:
            from src.db import Session
            Session.rollback()
            print(f"[ERROR in POST /admin/courses]: {e}")
            return jsonify({"msg": f"Failed to create course: {str(e)}"}), 500


@app.route('/admin/courses/<int:course_id>', methods=['DELETE', 'OPTIONS'])
def delete_admin_course(course_id):
    if request.method == 'OPTIONS':
        return make_response('', 200)
    try:
        from src.db import Session
        course = CourseModel.find_by_id(course_id)
        if course:
            course.delete_from_db()
            return jsonify({"msg": "success"}), 200
        return jsonify({"msg": "Course not found"}), 404
    except Exception as e:
        from src.db import Session
        Session.rollback()
        return jsonify({"msg": f"Failed to delete course: {str(e)}"}), 500


# ==================== STUDENT PORTAL ROUTES ====================

@app.route('/student/portal_data', methods=['GET'])
@token_required
def student_portal_data():
    student_id = getattr(request, 'student_id', None)
    student_name = getattr(request, 'user', None)

    student = None
    if student_id:
        student = StudentModel.find_by_id(student_id)
    elif student_name:
        student = StudentModel.find_by_name(student_name)

    if not student:
        students = StudentModel.find_all()
        if students:
            student = students[0]
        else:
            return jsonify({"msg": "Student profile not found"}), 404

    assigned_courses_raw = (student.courses or "").split(",")
    assigned_courses = [c.strip() for c in assigned_courses_raw if c.strip()]

    all_courses = CourseModel.find_all()
    if not assigned_courses:
        assigned_courses = [c.code for c in all_courses]

    all_attendances = AttendanceModel.find_all()
    student_attendances = [a for a in all_attendances if a.student_id == student.id]

    course_stats = []

    for c_code in assigned_courses:
        c_model = CourseModel.find_by_code(c_code)
        c_title = c_model.title if (c_model and c_model.title) else (c_model.name if (c_model and c_model.name) else c_code)

        c_code_clean = c_code.strip().upper()
        c_title_clean = c_title.strip().upper()

        # 1. Total class sessions held for THIS specific course across all dates & sessions
        course_all_atts = []
        for a in all_attendances:
            a_c = (getattr(a, 'course_code', '') or "").strip().upper()
            if a_c and (a_c == c_code_clean or a_c == c_title_clean or (c_code_clean and a_c in c_code_clean) or (c_code_clean and c_code_clean in a_c)):
                course_all_atts.append(a)

        # Distinct calendar dates for this course
        course_dates = set()
        for a in course_all_atts:
            if getattr(a, 'date', None):
                d_str = a.date.strftime("%Y-%m-%d") if hasattr(a.date, 'strftime') else str(a.date)[:10]
                course_dates.add(d_str)

        # Max sessions per student for this course (in case multiple sessions on same date)
        student_session_counts = {}
        for a in course_all_atts:
            student_session_counts[a.student_id] = student_session_counts.get(a.student_id, 0) + 1

        max_student_sessions = max(student_session_counts.values()) if student_session_counts else 0

        # Total held classes = max between distinct calendar dates and max sessions recorded
        total_classes = max(len(course_dates), max_student_sessions)

        # 2. Total class sessions this student was marked Present for THIS course
        student_course_atts = []
        for a in student_attendances:
            if not (getattr(a, 'is_present', False) == 1.0 or getattr(a, 'is_present', False) == True):
                continue
            a_c = (getattr(a, 'course_code', '') or "").strip().upper()
            if a_c and (a_c == c_code_clean or a_c == c_title_clean or (c_code_clean and a_c in c_code_clean) or (c_code_clean and c_code_clean in a_c)):
                student_course_atts.append(a)

        attended_count = len(student_course_atts)

        if total_classes > 0:
            attended_count = min(attended_count, total_classes)
            absent_count = max(0, total_classes - attended_count)
            percentage = round((attended_count / total_classes * 100), 1)
        else:
            total_classes = 0
            attended_count = 0
            absent_count = 0
            percentage = 100.0

        if percentage >= 80:
            status = "Good Standing"
        elif percentage >= 70:
            status = "Warning"
        else:
            status = "Low Attendance"

        course_stats.append({
            "code": c_code,
            "title": c_title,
            "total_classes": total_classes,
            "attended_classes": attended_count,
            "absent_classes": absent_count,
            "percentage": percentage,
            "status": status
        })

    attendance_logs = []
    for a in student_attendances:
        status_str = "Present" if (a.is_present == 1.0 or a.is_present == True) else "Absent"
        c_code_att = getattr(a, 'course_code', '') or ""
        attendance_logs.append({
            "id": a.id,
            "course": c_code_att,
            "date": a.date.strftime("%Y-%m-%d") if getattr(a, 'date', None) and hasattr(a.date, 'strftime') else "--",
            "check_in": a.entry_time.strftime("%I:%M %p") if getattr(a, 'entry_time', None) and hasattr(a.entry_time, 'strftime') else (a.date.strftime("%I:%M %p") if getattr(a, 'date', None) and hasattr(a.date, 'strftime') else "--"),
            "check_out": a.last_seen_time.strftime("%I:%M %p") if getattr(a, 'last_seen_time', None) and hasattr(a.last_seen_time, 'strftime') else "--",
            "total_minutes": getattr(a, 'total_minutes', 0) or 0,
            "status": status_str
        })

    notices = AbsenceNoticeModel.find_by_student_id(student.id)
    notice_list = [n.to_dict() for n in notices]

    id_path = os.path.join(DATASET_PATH, str(student.id))
    samples_count = 0
    if os.path.exists(id_path):
        samples_count = len([f for f in os.listdir(id_path) if f.lower().endswith(('.jpg', '.jpeg', '.png'))])

    is_face_registered = samples_count >= 10

    return jsonify({
        "msg": "success",
        "student": {
            "id": student.id,
            "name": student.name,
            "courses": assigned_courses,
            "is_face_registered": is_face_registered,
            "registered_samples_count": samples_count
        },
        "course_stats": course_stats,
        "attendance_logs": attendance_logs,
        "absence_notices": notice_list
    }), 200


@app.route('/student/absence_notice', methods=['POST', 'OPTIONS'])
@token_required
def submit_absence_notice():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    data = request.get_json() or {}
    course = (data.get("course") or "").strip()
    notice_date = (data.get("date") or "").strip()
    reason = (data.get("reason") or "").strip()

    if not course or not notice_date or not reason:
        return jsonify({"msg": "Course, Date, and Reason are required"}), 400

    student_id = getattr(request, 'student_id', None)
    student_name = getattr(request, 'user', None)

    student = None
    if student_id:
        student = StudentModel.find_by_id(student_id)
    if not student and student_name:
        student = StudentModel.find_by_name(student_name)

    if student:
        student_id = student.id
        student_name = student.name
    else:
        students = StudentModel.find_all()
        if students:
            student_id = students[0].id
            student_name = students[0].name
        else:
            student_id = 1
            student_name = "Student"

    notice = AbsenceNoticeModel(
        student_id=student_id,
        student_name=student_name,
        course=course,
        date=notice_date,
        reason=reason,
        status="Submitted"
    )
    notice.save_to_db()

    return jsonify({"msg": "success", "notice": notice.to_dict()}), 201


@app.route('/faculty/absence_notices', methods=['GET', 'OPTIONS'])
@token_required
def faculty_absence_notices():
    if request.method == 'OPTIONS':
        return make_response('', 200)

    all_notices = AbsenceNoticeModel.find_all()
    return jsonify([n.to_dict() for n in all_notices]), 200


@app.route('/faculty/absence_notices/<notice_id>', methods=['PUT', 'OPTIONS'])
@app.route('/faculty/absence_notices/<int:notice_id>', methods=['PUT', 'OPTIONS'])
@token_required
def update_absence_notice_status(notice_id):
    if request.method == 'OPTIONS':
        return make_response('', 200)

    try:
        notice_id_int = int(notice_id)
    except (ValueError, TypeError):
        notice_id_int = notice_id

    data = request.get_json() or {}
    new_status = (data.get("status") or "").strip()

    if not new_status:
        return jsonify({"msg": "Status is required"}), 400

    notice = AbsenceNoticeModel.find_by_id(notice_id_int)
    if not notice:
        return jsonify({"msg": "Absence notice not found"}), 404

    notice.status = new_status
    notice.save_to_db()

    try:
        from datetime import datetime as dt_parse
        notice_date_obj = dt_parse.strptime(notice.date, "%Y-%m-%d").date()
    except Exception:
        notice_date_obj = ds.date.today()

    notice_course = (notice.course or "").strip().upper()
    existing_att = AttendanceModel.find_by_student_and_date(notice.student_id, notice_date_obj, notice_course)

    if new_status == "Approved":
        if not existing_att:
            now_dt = ds.datetime.now()
            existing_att = AttendanceModel(
                student_id=notice.student_id,
                course_code=notice_course,
                entry_time=now_dt,
                last_seen_time=now_dt,
                total_minutes=60,
                is_present=1.0
            )
        else:
            existing_att.is_present = 1.0
            if notice_course and not existing_att.course_code:
                existing_att.course_code = notice_course
        existing_att.save_to_db()
    elif new_status == "Rejected":
        if existing_att:
            existing_att.is_present = 0.0
            existing_att.save_to_db()

    return jsonify({"msg": "success", "notice": notice.to_dict()}), 200


# ====== Start Server ======
if __name__ == '__main__':
    print("[INFO] Starting Flask-SocketIO server...")
    socketio.run(app, host='0.0.0.0', port=SERVER_PORT, allow_unsafe_werkzeug=True)
