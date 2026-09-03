from typing import List
from uuid import uuid4
from datetime import date as dt, datetime as dtime, time

# pyrefly: ignore [missing-import]
from sqlalchemy import Column,Float,Integer, String, Boolean, DateTime, TIMESTAMP, ForeignKey, Time
# pyrefly: ignore [missing-import]
from sqlalchemy.ext.declarative import declarative_base
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import relationship, backref
# pyrefly: ignore [missing-import]
from sqlalchemy.sql import func


try:
    from src.db import Session, engine
except ModuleNotFoundError:
    from db import Session, engine


Base = declarative_base()


class TeacherModel(Base):
    __tablename__ = "teachers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), nullable=False, unique=True)
    password = Column(String(255), nullable=False)
    role = Column(String(20), default="user")  # Can be "user" or "admin"
    courses = Column(String(500), default="")

    def __init__(self, name, email, password, role="user", courses=""):
        self.name = name
        self.email = email
        self.password = password
        self.role = role
        self.courses = courses

    @classmethod
    def find_by_email(cls, email: str) -> "TeacherModel":
        return Session.query(cls).filter_by(email=email).first()

    @classmethod
    def find_by_id(cls, _id: int) -> "TeacherModel":
        return Session.query(cls).filter_by(id=_id).first()

    @classmethod
    def find_all(cls) -> List["TeacherModel"]:
        return Session.query(cls).all()

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "courses": self.courses or ""
        }

    def save_to_db(self) -> None:
        Session.add(self)
        Session.commit()

    def delete_from_db(self) -> None:
        Session.delete(self)
        Session.commit()


class StudentModel(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True)
    name = Column(String(80), unique=True, nullable=False)
    password = Column(String(255), nullable=True)
    courses = Column(String(500), default="")
    attendances = relationship(
        "AttendanceModel",
        backref=backref("student")
    )

    @classmethod
    def find_by_name(cls, name: str) -> "StudentModel":
        return Session.query(cls).filter_by(name=name).first()

    @classmethod
    def find_by_id(cls, _id: int) -> "StudentModel":
        return Session.query(cls).filter_by(id=_id).first()

    @classmethod
    def find_all(cls) -> List["StudentModel"]:
        return Session.query(cls).all()

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "courses": self.courses or ""
        }

    def save_to_db(self) -> None:
        Session.add(self)
        Session.commit()

    def delete_from_db(self) -> None:
        Session.delete(self)
        Session.commit()


class CourseModel(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(50), nullable=False, default="")
    name = Column(String(100), nullable=False, default="")
    section = Column(String(50), nullable=False, default="A")
    title = Column(String(120), nullable=True, default="")
    is_open_credit = Column(Boolean, default=False)

    def __init__(self, code, title, name="", section="A", is_open_credit=False):
        self.code = code
        self.title = title
        self.name = title or name or code or ""
        self.section = section or "A"
        self.is_open_credit = is_open_credit

    @classmethod
    def find_all(cls) -> List["CourseModel"]:
        return Session.query(cls).all()

    @classmethod
    def find_by_code(cls, code: str) -> "CourseModel":
        return Session.query(cls).filter(
            (cls.code == code) | (cls.name == code)
        ).first()

    @classmethod
    def find_by_id(cls, _id: int) -> "CourseModel":
        return Session.query(cls).filter_by(id=_id).first()

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code or self.name or "",
            "title": self.title or self.name or "",
            "section": self.section or "A"
        }

    def save_to_db(self) -> None:
        try:
            Session.add(self)
            Session.commit()
        except Exception:
            Session.rollback()
            raise

    def delete_from_db(self) -> None:
        try:
            Session.delete(self)
            Session.commit()
        except Exception:
            Session.rollback()
            raise

    @classmethod
    def initialize_default_courses(cls):
        defaults = [
            ("CSE-101", "Structured Programming"),
            ("CSE-102", "Data Structures & Algorithms"),
            ("CSE-201", "Object Oriented Programming"),
            ("MAT-101", "Linear Algebra & Differential Equations"),
            ("EEE-101", "Electrical Circuits & Electronics"),
            ("ENG-101", "English Communication Skills")
        ]
        for code, title in defaults:
            if not cls.find_by_code(code):
                course = cls(code=code, title=title, name=title)
                course.save_to_db()


class AttendanceModel(Base):
    __tablename__ = "attendances"

    # Primary key = date + student_id (composite key possible, but better to use id)
    id = Column(Integer, primary_key=True, autoincrement=True)

    date = Column(DateTime(timezone=True), default=dtime.now)  # full datetime of first detection
    student_id = Column(Integer, ForeignKey("students.id"))
    course_code = Column(String(50), default="")  # Associated course code (e.g. "CSE-101")
    session_id = Column(String(100), default="")   # Unique session identifier

    # New fields
    entry_time = Column(DateTime(timezone=True), default=dtime.now)   # first time detected today
    last_seen_time = Column(DateTime(timezone=True), default=dtime.now)  # updated each detection
    total_minutes = Column(Integer, default=0)  # total minutes stayed
    # is_present = Column(Boolean, default=False)  # marked true when >= threshold
    is_present = Column(Float, default=0.0)

    # ---------------------- CLASS METHODS ----------------------
    @classmethod
    def find_by_student_and_date(cls, student_id: int, target_date: date, course_code: str = None, session_id: str = None):
        query = Session.query(cls).filter(
            cls.student_id == student_id,
            func.date(cls.date) == target_date
        )
        if course_code:
            query = query.filter(cls.course_code == course_code)
        if session_id:
            query = query.filter(cls.session_id == session_id)
        return query.first()
    
    @classmethod
    def exists_by_id(cls, _id: int) -> bool:
        return Session.query(cls).filter_by(student_id=_id).first()

    @classmethod
    def find_by_date(cls, date: dt, student: StudentModel) -> "AttendanceModel":
        date_only = date.date()
        return Session.query(cls).filter(
            func.date(cls.date) == date_only,
            cls.student_id == student.id
        ).first()

    @classmethod
    def find_by_student(cls, student: StudentModel) -> "AttendanceModel":
        return Session.query(cls).filter_by(student_id=student.id).first()

    @classmethod
    def find_all(cls) -> List["AttendanceModel"]:
        return Session.query(cls).all()

    @classmethod
    def is_marked(cls, date_val, student: StudentModel) -> bool:
        if not student:
            return False
        date_only = date_val.date() if hasattr(date_val, "date") and callable(getattr(date_val, "date")) else date_val
        marked = Session.query(cls).filter(
            func.date(cls.date) == date_only,
            cls.student_id == student.id
        ).first()
        return marked is not None

    def save_to_db(self) -> None:
        Session.add(self)
        Session.commit()

    def delete_from_db(self) -> None:
        Session.delete(self)
        Session.commit()




class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    late_count = Column(Integer, nullable=False)

    @classmethod
    def find_by_id(cls, _id: int) -> "Settings":
        return Session.query(cls).filter_by(id=_id).first()

    @classmethod
    def find_all(cls) -> List["Settings"]:
        return Session.query(cls).all()

    @classmethod
    def get_current_settings(cls) -> "Settings":
        """Get the first settings record (typically there's only one)"""
        return cls.find_by_id(1)

    @classmethod
    def update_settings(cls, _id: int, start_time: str, end_time: str, late_count: int) -> "Settings":
        setting = cls.find_by_id(_id)
        if setting:
            try:
                # Parse time strings into time objects
                if isinstance(start_time, str):
                    start_time = dtime.strptime(start_time, "%H:%M:%S").time()
                if isinstance(end_time, str):
                    end_time = dtime.strptime(end_time, "%H:%M:%S").time()
                
                setting.start_time = start_time
                setting.end_time = end_time
                setting.late_count = int(late_count)
                Session.commit()
                return setting
            except ValueError as e:
                Session.rollback()
                raise ValueError(f"Invalid time format: {str(e)}")
        return None

    @classmethod
    def initialize_default_settings(cls):
        """Create default settings if none exist"""
        if not cls.get_current_settings():
            default_settings = cls(
                id=1,
                start_time=dtime.strptime("09:00:00", "%H:%M:%S").time(),
                end_time=dtime.strptime("17:00:00", "%H:%M:%S").time(),
                late_count=15
            )
            default_settings.save_to_db()

    def to_dict(self):
        """Convert settings to dictionary with formatted times"""
        return {
            "id": self.id,
            "start_time": self.start_time.strftime("%I:%M:%S %p"),
            "end_time": self.end_time.strftime("%I:%M:%S %p"),
            "late_count": self.late_count
        }

    def save_to_db(self) -> None:
        Session.add(self)
        Session.commit()

    def delete_from_db(self) -> None:
        Session.delete(self)
        Session.commit()

class VideoFeedModel(Base):
    __tablename__ = "video_feeds"

    id = Column(String(30), nullable=False, primary_key=True)
    is_active = Column(Boolean, default=False)
    url = Column(String, nullable=False)

    @classmethod
    def find_by_id(cls, _id: str) -> "VideoFeedModel":
        return Session.query(cls).filter_by(id=_id).first()

    @classmethod
    def find_by_url(cls, url: str) -> "VideoFeedModel":
        return Session.query(cls).filter_by(url=url).first()

    @classmethod
    def find_all(cls) -> List["VideoFeedModel"]:
        return Session.query(cls).all()

    @classmethod
    def initialize_default_admin(cls):
        # pyrefly: ignore [missing-import]
        from werkzeug.security import generate_password_hash
        admin_email = "admin@green.edu.bd"
        if not cls.find_by_email(admin_email):
            admin_user = cls(
                name="System Administrator",
                email=admin_email,
                password=generate_password_hash("admin123", method="pbkdf2:sha256"),
                role="admin"
            )
            admin_user.save_to_db()

    def save_to_db(self) -> None:
        Session.add(self)
        Session.commit()

    def delete_from_db(self) -> None:
        Session.delete(self)
        Session.commit()


class AbsenceNoticeModel(Base):
    __tablename__ = "absence_notices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, nullable=False)
    student_name = Column(String(100), nullable=False)
    course = Column(String(50), nullable=False)
    date = Column(String(20), nullable=False)
    reason = Column(String(500), nullable=False)
    status = Column(String(30), default="Submitted")
    created_at = Column(DateTime(timezone=True), default=dtime.now)

    def to_dict(self):
        return {
            "id": self.id,
            "student_id": self.student_id,
            "student_name": self.student_name,
            "course": self.course,
            "date": self.date,
            "reason": self.reason,
            "status": self.status,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S") if self.created_at else ""
        }

    def save_to_db(self) -> None:
        Session.add(self)
        Session.commit()

    @classmethod
    def find_by_id(cls, notice_id: int):
        return Session.query(cls).filter_by(id=notice_id).first()

    @classmethod
    def find_by_student_id(cls, student_id: int):
        return Session.query(cls).filter_by(student_id=student_id).order_by(cls.id.desc()).all()

    @classmethod
    def find_all(cls):
        return Session.query(cls).order_by(cls.id.desc()).all()

    def delete_from_db(self) -> None:
        Session.delete(self)
        Session.commit()


Base.metadata.create_all(engine)
try:
    with engine.connect() as conn:
        conn.execute("ALTER TABLE students ADD COLUMN password VARCHAR(255);")
except Exception:
    pass
try:
    with engine.connect() as conn:
        conn.execute("ALTER TABLE students ADD COLUMN courses VARCHAR(500) DEFAULT '';")
except Exception:
    pass
try:
    with engine.connect() as conn:
        conn.execute("ALTER TABLE teachers ADD COLUMN courses VARCHAR(500) DEFAULT '';")
except Exception:
    pass
try:
    with engine.connect() as conn:
        conn.execute("ALTER TABLE courses ADD COLUMN title VARCHAR(120) DEFAULT '';")
except Exception:
    pass
try:
    with engine.connect() as conn:
        conn.execute("ALTER TABLE courses ADD COLUMN code VARCHAR(30) DEFAULT '';")
except Exception:
    pass
try:
    with engine.connect() as conn:
        conn.execute("ALTER TABLE courses ADD COLUMN name VARCHAR(120) DEFAULT '';")
except Exception:
    pass

try:
    with engine.connect() as conn:
        conn.execute("ALTER TABLE attendances ADD COLUMN course_code VARCHAR(50) DEFAULT '';")
except Exception:
    pass

try:
    with engine.connect() as conn:
        conn.execute("ALTER TABLE attendances ADD COLUMN session_id VARCHAR(100) DEFAULT '';")
except Exception:
    pass

Settings.initialize_default_settings()
try:
    TeacherModel.initialize_default_admin()
except Exception:
    pass
try:
    CourseModel.initialize_default_courses()
except Exception:
    pass
