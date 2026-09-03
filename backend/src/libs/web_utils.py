import pickle
from typing import Dict
from datetime import date as dt

# pyrefly: ignore [missing-import]
import cv2
# pyrefly: ignore [missing-import]
import imutils
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
import face_recognition

try:
    from src.settings import (
        DLIB_MODEL, DLIB_TOLERANCE,
        ENCODINGS_FILE
    )
    from src.libs.base_camera import BaseCamera
    from src.models import StudentModel, AttendanceModel
except ModuleNotFoundError:
    from settings import (
        DLIB_MODEL, DLIB_TOLERANCE,
        ENCODINGS_FILE
    )
    from libs.base_camera import BaseCamera
    from models import StudentModel, AttendanceModel


class RecognitionCamera(BaseCamera):
    video_source = 0
    process_this_frame = True

    @classmethod
    def set_video_source(cls, source):
        cls.video_source = source

    @classmethod
    def frames(cls):
        print("[INFO] starting video stream...")
        camera = cv2.VideoCapture(cls.video_source)

        if not camera.isOpened():
            raise RuntimeError('Could not start camera.')

        print("[INFO] loading encodings...")
        try:
            with open(ENCODINGS_FILE, "rb") as ef:
                data = pickle.loads(ef.read())
        except FileNotFoundError:
            data = {"encodings": [], "ids": []}
            print("[WARNING] Encodings file not found. Using empty encodings.")

        known_students = {}
        while True:
            _, img = camera.read()
            yield cls.recognize_n_attendance(img, data, known_students)

    @classmethod
    def recognize_n_attendance(cls, frame: np.ndarray,
        data: Dict, known_students: Dict) -> bytes:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb = imutils.resize(rgb_frame, width=750)
        r = frame.shape[1] / float(rgb.shape[1])

        boxes = []
        encodings = []
        names = []

        if cls.process_this_frame:
            boxes = face_recognition.face_locations(rgb, model=DLIB_MODEL)
            encodings = face_recognition.face_encodings(rgb, boxes)

            for encoding in encodings:
                matches = face_recognition.compare_faces(data["encodings"], encoding, DLIB_TOLERANCE)
                display_name = "Unknown"

                if True in matches:
                    matched_indexes = [i for (i, b) in enumerate(matches) if b]
                    counts = {}

                    for matched_index in matched_indexes:
                        _id = data["ids"][matched_index]
                        counts[_id] = counts.get(_id, 0) + 1

                    _id = max(counts, key=counts.get)
                    if _id:
                        if _id in known_students.keys():
                            student = known_students[_id]
                        else:
                            student = StudentModel.find_by_id(_id)
                            known_students[_id] = student
                            if student and not AttendanceModel.is_marked(dt.today(), student):
                                student_attendance = AttendanceModel(student_id=student.id, is_present=1.0)
                                student_attendance.save_to_db()
                        if student:
                            display_name = student.name
                names.append(display_name)
        cls.process_this_frame = not cls.process_this_frame

        for ((top, right, bottom, left), display_name) in zip(boxes, names):
            if display_name == "Unknown":
                continue
            top = int(top * r)
            right = int(right * r)
            bottom = int(bottom * r)
            left = int(left * r)
            top_left = (left, top)
            bottom_right = (right, bottom)

            cv2.rectangle(frame, top_left, bottom_right, (0, 255, 0), 2)
            y = top - 15 if top - 15 > 15 else top + 15
            cv2.putText(frame, display_name, (left, y), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)
        return cv2.imencode('.jpg', frame)[1].tobytes()
