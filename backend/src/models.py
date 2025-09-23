from typing import List
from uuid import uuid4
from datetime import date as dt, datetime as dtime, time

from sqlalchemy import Column, Integer, String, Boolean, DateTime, TIMESTAMP, ForeignKey, Time
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func


from src.db import Session, engine


Base = declarative_base()


class TeacherModel(Base):
    __tablename__ = "teachers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), nullable=False, unique=True)
    password = Column(String(80), nullable=False)
    role = Column(String(20), default="user")  # Can be "user" or "admin"


    def __init__(self, name, email, password, role="user"):
        self.name = name
        self.email = email
        self.password = password
        self.role = role

    @classmethod
    def find_by_email(cls, email: str) -> "TeacherModel":
        return Session.query(cls).filter_by(email=email).first()

    @classmethod
    def find_by_id(cls, _id: int) -> "TeacherModel":
        return Session.query(cls).filter_by(id=_id).first()

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
            "name": self.name
        }

    def save_to_db(self) -> None:
        Session.add(self)
        Session.commit()

    def delete_from_db(self) -> None:
        Session.delete(self)
        Session.commit()


class AttendanceModel(Base):
    __tablename__ = "attendances"

    # Primary key = date + student_id (composite key possible, but better to use id)
    id = Column(Integer, primary_key=True, autoincrement=True)

    date = Column(DateTime(timezone=True), default=dtime.now)  # full datetime of first detection
    student_id = Column(Integer, ForeignKey("students.id"))

    # New fields
    entry_time = Column(DateTime(timezone=True), default=dtime.now)   # first time detected today
    last_seen_time = Column(DateTime(timezone=True), default=dtime.now)  # updated each detection
    total_minutes = Column(Integer, default=0)  # total minutes stayed
    is_present = Column(Boolean, default=False)  # marked true when >= threshold

    # ---------------------- CLASS METHODS ----------------------
    @classmethod
    def find_by_student_and_date(cls, student_id: int, target_date: date):
        return Session.query(cls).filter(
            cls.student_id == student_id,
            func.date(cls.date) == target_date
        ).first()
    
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
    def is_marked(cls, date: dt, student: StudentModel) -> bool:
        date_only = date.date()
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

    def save_to_db(self) -> None:
        Session.add(self)
        Session.commit()

    def delete_from_db(self) -> None:
        Session.delete(self)
        Session.commit()

Base.metadata.create_all(engine)
Settings.initialize_default_settings()