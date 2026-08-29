from functools import wraps
import os
from flask import Flask, jsonify, request, make_response  # Ensure jsonify is imported correctly
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import cv2
import jwt
import numpy as np
import face_recognition
import pickle
import base64
from datetime import datetime as dt
import datetime as ds
from src.models import (
    Settings, StudentModel, AttendanceModel, TeacherModel,
    CourseModel, EnrollmentModel, RoomModel, ExamSlotModel, ExamRoutineModel
)
from src.libs.exam_scheduler import SmartExamScheduler, ConflictGraph
from datetime import date as dt, datetime as dtime
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from src.settings import (
    DATASET_PATH,
    HAAR_CASCADE_PATH,
    DLIB_MODEL,
    DLIB_TOLERANCE,
    ENCODINGS_FILE
)
from src.libs.train_classifier import TrainClassifier
load_dotenv()
SERVER_PORT = int(os.getenv("SERVER_PORT", 5000))
# ====== Flask App Setup ======
app = Flask(__name__)
CORS(app,supports_credentials=True,methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],)

socketio = SocketIO(app, cors_allowed_origins="*")

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

# ====== Helper: Face Recognition & Attendance ======
def recognize_faces_and_mark_attendance(encodings):
    names = []
    known_students = {}

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
                if _id in known_students:
                    student = known_students[_id]
                else:
                    student = StudentModel.find_by_id(_id)
                    known_students[_id] = student

                # Get today's record
                today = ds.date.today()
                attendance = AttendanceModel.find_by_student_and_date(student.id, today)

                # now = ds.datetime.utcnow()
                now=ds.datetime.now()


                if attendance:
                    # Already exists → update last_seen_time
                    attendance.last_seen_time = now

                    # Recalculate total time (minutes)
                    time_spent = (attendance.last_seen_time - attendance.entry_time).total_seconds() / 60
                    attendance.total_minutes = int(time_spent)

                    # Mark present if >= 30 mins
                    if attendance.total_minutes >= 30:
                        attendance.is_present = 1
                    else:
                        attendance.is_present = 0.5

                    attendance.save_to_db()
                    print(f"[INFO] Updated {student.name}: last_seen={attendance.last_seen_time}, total={attendance.total_minutes} mins")
                else:
                    # First detection today → create record
                    student_attendance = AttendanceModel(
                        student=student,
                        entry_time=now,
                        last_seen_time=now,
                        total_minutes=0,
                        is_present=False
                    )
                    student_attendance.save_to_db()
                    print(f"[INFO] New attendance for {student.name} at {now}")

                display_name = student.name

        names.append(display_name)

    return names


# ====== Handle Incoming Frame from Client (binary) ======
@socketio.on('client_frame')
def handle_client_frame(data):
    try:
        # print("exicute server")
        # Decode bytes -> numpy array
        np_arr = np.frombuffer(data, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            print("[ERROR] Frame decoding failed.")
            return

        # Convert BGR to RGB
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        r = frame.shape[1] / float(rgb.shape[1])

        # Face detection and encoding
        boxes = face_recognition.face_locations(rgb, model=DLIB_MODEL)
        encodings = face_recognition.face_encodings(rgb, boxes)

        # Face recognition and attendance marking
        names = recognize_faces_and_mark_attendance(encodings)

        # Draw bounding boxes and names
        for ((top, right, bottom, left), name) in zip(boxes, names):
            top = int(top * r)
            right = int(right * r)
            bottom = int(bottom * r)
            left = int(left * r)

            cv2.rectangle(frame, (left, top), (right, bottom), (0, 255, 0), 2)
            y = top - 15 if top - 15 > 15 else top + 15
            cv2.putText(frame, str(name), (left, y), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)

        # Encode frame back to JPEG
        success, buffer = cv2.imencode('.jpg', frame)
        if not success:
            print("[ERROR] Failed to encode frame.")
            return

        # Instead of base64, send raw buffer
        emit('processed_frame', buffer.tobytes(), broadcast=True)

    except Exception as e:
        print("[ERROR]", e)

# ====== Optional CLI Video Attendance Class ======
class VideoAttendanceRecognizer:
    def __init__(self, input_video, app_title="Face Recognition"):
        self.input_video = input_video
        self.app_title = app_title

    def recognize_n_attendance(self):
        print("[INFO] Starting video stream...")
        cap = cv2.VideoCapture(self.input_video)
        known_students = {}

        while True:
            ret, img = cap.read()
            if not ret:
                break

            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            r = img.shape[1] / float(rgb.shape[1])
            boxes = face_recognition.face_locations(rgb, model=DLIB_MODEL)
            encodings = face_recognition.face_encodings(rgb, boxes)
            names = recognize_faces_and_mark_attendance(encodings)

            for ((top, right, bottom, left), display_name) in zip(boxes, names):
                if display_name == "Unknown":
                    continue
                top = int(top * r)
                right = int(right * r)
                bottom = int(bottom * r)
                left = int(left * r)
                cv2.rectangle(img, (left, top), (right, bottom), (0, 255, 0), 2)
                y = top - 15 if top - 15 > 15 else top + 15
                cv2.putText(img, display_name, (left, y), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)

            cv2.imshow(f"Recognizing Faces - {self.app_title}", img)
            if cv2.waitKey(100) & 0xFF == 27:
                break

        cap.release()
        cv2.destroyAllWindows()
        print("[INFO] Attendance Successful!")
# app = Flask(__name__)
# CORS(app)  # This will allow all domains (development only)
# another route
# Middleware: Verify JWT
cookie_name=app.config.get("COOKIE_NAME", "attendance-system")
secret_key = app.config.get("JWT_SECRET_KEY", "sss")
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        print("deco---cookie")
        token = request.cookies.get(cookie_name)
        print(token)
        if not token:
            return jsonify({"msg": "Unauthorized"}), 401

        try:
            data = jwt.decode(token, secret_key, algorithms=["HS256"])
            request.user = data['user']
            request.email=data['email']
        except jwt.ExpiredSignatureError:
            return jsonify({"msg": "Token_expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"msg": "Invalid_token"}), 401

        return f(*args, **kwargs)
    return decorated

@app.route('/dashboard',methods=['GET'])
@token_required
def dashboard():

    students=StudentModel.find_all()
    attendances = AttendanceModel.find_all()
    all_info = []
    for student in students:
        # print(student.name)
        date_time = {
            "dates": []
        }

        for attendance in attendances:
            if student.id == attendance.student_id:
                date_time["dates"].append({
                    "attendance_date": attendance.date.strftime("%Y-%m-%d"),
                    "time":attendance.date.strftime("%I-%M-%p")
                })
        student_data = {
            "id": student.id,
            "name": student.name,
            "date_time": date_time
        }
        
        all_info.append(student_data)
    print(all_info)
    student_json = jsonify(all_info)
    # print(student_json)
    return student_json, 200
@app.route('/get_attendance', methods=['GET'])
@token_required
def get_attendance():
    students = StudentModel.find_all()
    attendances = AttendanceModel.find_all()
    setting = Settings.find_all()[0]
    print("total",attendances)
    all_info = []

    # Threshold time: start_time + late_count minutes
    threshold_time = (ds.datetime.combine(ds.date.today(), setting.start_time) +
                      ds.timedelta(minutes=setting.late_count)).time()

    today = ds.date.today()

    # print(today)

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
# //signup route
@app.route('/signup',methods=['POST'])
def post_signup():
    data = request.get_json()
    agreeToTerms=data.get("agreeToTerms")
    email=data.get("email").strip()
    name=data.get("name").strip()
    password=data.get('password').strip()
    hash_pass=generate_password_hash(password);
    teacher=TeacherModel.find_by_email(email)
    if teacher:
        return jsonify({"msg": "Email already exists"}), 409
    else:
        teachers=TeacherModel(name,email,hash_pass)
        teachers.save_to_db()
        return jsonify({"msg":"success"}), 200


# sign In route
@app.route('/stay_signin',methods=['GET'])
@token_required
def stay_signin():
    print(request.user)
    return jsonify({"msg": "success","name":request.user,"email":request.email}), 200
    
@app.route('/signin',methods=['POST'])
def get_signin():
    data = request.get_json()
    email=data.get("email").strip()
    password=data.get('password').strip()
    teacher=TeacherModel.find_by_email(email)
    
    if teacher:
        if check_password_hash(teacher.password,password):
            secret_key = app.config.get("JWT_SECRET_KEY", "sss")
            
            print("password true")
            token = jwt.encode({
                'user': teacher.name,
                'email':teacher.email,
                'exp': ds.datetime.utcnow() + ds.timedelta(hours=1)
            },secret_key, algorithm="HS256")
            print(token)
            resp = make_response(jsonify({"msg": "success","token":token}))
            # set cookie
            # resp.set_cookie(cookie_name, token)
            resp.set_cookie(
                cookie_name,
                token,
                httponly=True,
                secure=False,          # True if running HTTPS
                samesite='Lax'         # or 'None' if frontend is on a different domain and using HTTPS
            )
            print("set the cookie")
            return resp, 200
        else:
            return jsonify({"msg": "unauthorized"}), 401
    else:
        return jsonify({"msg":"user no find"}), 409
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
        faces = face_classifier.detectMultiScale(frame, 1.0485258, 6)

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
                    TrainClassifier.train()

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

# ====== Smart Exam Routine Generator APIs ======
def get_default_seed_data():
    students = [
        {"id": 1, "name": "S1", "section": "Section A"},
        {"id": 2, "name": "S2", "section": "Section A"},
        {"id": 3, "name": "S3", "section": "Section A"},
        {"id": 4, "name": "S4", "section": "Section B"},
        {"id": 5, "name": "S5", "section": "Section B"}
    ]
    courses = [
        {"id": 1, "code": "CSE101", "name": "Structured Programming", "section": "Section A", "is_open_credit": False},
        {"id": 2, "code": "CSE102", "name": "Data Structures", "section": "Section A", "is_open_credit": False},
        {"id": 3, "code": "CSE103", "name": "Discrete Mathematics", "section": "Section B", "is_open_credit": False},
        {"id": 4, "code": "CSE104", "name": "Algorithms", "section": "Section B", "is_open_credit": False},
        {"id": 5, "code": "CSE201", "name": "Database Systems", "section": "Open Credit", "is_open_credit": True}
    ]
    enrollments = [
        {"student_id": 1, "course_code": "CSE101"},
        {"student_id": 1, "course_code": "CSE102"},
        {"student_id": 2, "course_code": "CSE101"},
        {"student_id": 2, "course_code": "CSE103"},
        {"student_id": 3, "course_code": "CSE102"},
        {"student_id": 3, "course_code": "CSE104"},
        {"student_id": 4, "course_code": "CSE103"},
        {"student_id": 4, "course_code": "CSE104"},
        {"student_id": 5, "course_code": "CSE101"},
        {"student_id": 5, "course_code": "CSE104"},
        {"student_id": 1, "course_code": "CSE201"},
        {"student_id": 4, "course_code": "CSE201"}
    ]
    slots = [
        {"id": 1, "exam_date": "Day 1", "start_time": "10:00 AM", "end_time": "12:00 PM", "slot_name": "Day 1 - 10:00 AM"},
        {"id": 2, "exam_date": "Day 1", "start_time": "02:00 PM", "end_time": "04:00 PM", "slot_name": "Day 1 - 02:00 PM"},
        {"id": 3, "exam_date": "Day 2", "start_time": "10:00 AM", "end_time": "12:00 PM", "slot_name": "Day 2 - 10:00 AM"},
        {"id": 4, "exam_date": "Day 2", "start_time": "02:00 PM", "end_time": "04:00 PM", "slot_name": "Day 2 - 02:00 PM"}
    ]
    rooms = [
        {"id": 1, "room_number": "Room 101", "capacity": 50},
        {"id": 2, "room_number": "Room 102", "capacity": 40}
    ]
    return students, courses, enrollments, slots, rooms

@app.route('/api/exam-routine/generate', methods=['POST'])
@app.route('/exam_routine/generate', methods=['POST'])
def generate_exam_routine():
    try:
        data = request.get_json() or {}
        
        req_students = data.get("students")
        req_courses = data.get("courses")
        req_enrollments = data.get("enrollments")
        req_slots = data.get("slots")
        req_rooms = data.get("rooms")

        def_students, def_courses, def_enrollments, def_slots, def_rooms = get_default_seed_data()

        students = req_students if req_students is not None else [s.to_dict() for s in StudentModel.find_all()]
        if not students:
            students = def_students

        courses = req_courses if req_courses is not None else [c.to_dict() for c in CourseModel.find_all()]
        if not courses:
            courses = def_courses

        slots = req_slots if req_slots is not None else [s.to_dict() for s in ExamSlotModel.find_all()]
        if not slots:
            slots = def_slots

        rooms = req_rooms if req_rooms is not None else [r.to_dict() for r in RoomModel.find_all()]
        if not rooms:
            rooms = def_rooms

        if req_enrollments is not None:
            enrollments = req_enrollments
        else:
            db_en = EnrollmentModel.find_all()
            if db_en:
                enrollments = []
                for e in db_en:
                    c = CourseModel.find_by_id(e.course_id)
                    if c:
                        enrollments.append({"student_id": e.student_id, "course_code": c.code})
            else:
                enrollments = def_enrollments

        scheduler = SmartExamScheduler(students, courses, enrollments, slots, rooms)
        result = scheduler.solve()

        if result.get("status") == "success":
            try:
                rec = ExamRoutineModel(routine_json=json.dumps(result))
                rec.save_to_db()
            except Exception as ex:
                print(f"[WARNING] Could not save routine to DB: {ex}")

        return jsonify(result), 200
    except Exception as e:
        print("[ERROR in generate_exam_routine]", e)
        return jsonify({"status": "failed", "error": str(e)}), 500


@app.route('/api/exam-routine', methods=['GET'])
@app.route('/exam_routine', methods=['GET'])
def get_exam_routine():
    try:
        latest = ExamRoutineModel.find_latest()
        if latest:
            return jsonify(json.loads(latest.routine_json)), 200
        
        def_students, def_courses, def_enrollments, def_slots, def_rooms = get_default_seed_data()
        scheduler = SmartExamScheduler(def_students, def_courses, def_enrollments, def_slots, def_rooms)
        result = scheduler.solve()
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/exam-routine/conflicts', methods=['GET'])
@app.route('/exam_routine/conflicts', methods=['GET'])
def get_exam_conflicts():
    try:
        def_students, def_courses, def_enrollments, _, _ = get_default_seed_data()
        cg = ConflictGraph(def_students, def_courses, def_enrollments)
        return jsonify(cg.to_dict()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/exam-routine/statistics', methods=['GET'])
@app.route('/exam_routine/statistics', methods=['GET'])
def get_exam_statistics():
    try:
        latest = ExamRoutineModel.find_latest()
        if latest:
            res_data = json.loads(latest.routine_json)
            return jsonify(res_data.get("statistics", {})), 200
        
        def_students, def_courses, def_enrollments, def_slots, def_rooms = get_default_seed_data()
        scheduler = SmartExamScheduler(def_students, def_courses, def_enrollments, def_slots, def_rooms)
        result = scheduler.solve()
        return jsonify(result.get("statistics", {})), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/exam-routine/seed', methods=['POST'])
@app.route('/exam_routine/seed', methods=['POST'])
def seed_exam_data():
    try:
        def_students, def_courses, def_enrollments, def_slots, def_rooms = get_default_seed_data()
        
        for s in def_students:
            if not StudentModel.find_by_name(s["name"]):
                st = StudentModel(name=s["name"])
                st.save_to_db()

        for c in def_courses:
            if not CourseModel.find_by_code(c["code"]):
                cm = CourseModel(code=c["code"], name=c["name"], section=c["section"], is_open_credit=c["is_open_credit"])
                cm.save_to_db()

        for r in def_rooms:
            if not RoomModel.find_by_id(r["id"]):
                rm = RoomModel(room_number=r["room_number"], capacity=r["capacity"])
                rm.save_to_db()

        for sl in def_slots:
            if not ExamSlotModel.find_all():
                esm = ExamSlotModel(exam_date=sl["exam_date"], start_time=sl["start_time"], end_time=sl["end_time"], slot_name=sl["slot_name"])
                esm.save_to_db()

        return jsonify({"message": "Seed exam data successfully inserted into database!", "seed_data": get_default_seed_data()}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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

# ====== Start Server ======
if __name__ == '__main__':
    print("[INFO] Starting Flask-SocketIO server...")
    socketio.run(app, host='0.0.0.0', port=SERVER_PORT)
