import os
import pickle

# pyrefly: ignore [missing-import]
import cv2
# pyrefly: ignore [missing-import]
import face_recognition

try:
    from src.settings import DATASET_PATH, ENCODINGS_FILE, DLIB_MODEL
except ModuleNotFoundError:
    from settings import DATASET_PATH, ENCODINGS_FILE, DLIB_MODEL


class TrainClassifier:
    """Train Classifier by storing results in `files/encodings.pickle` file"""
    @classmethod
    def train(cls, target_id=None):
        try:
            print("[INFO] loading encodings...")
            with open(ENCODINGS_FILE, "rb") as ef:
                data = pickle.loads(ef.read())
            known_encodings = data.get("encodings", [])
            known_ids = data.get("ids", [])
        except FileNotFoundError:
            known_encodings = []
            known_ids = []

        if target_id is not None:
            target_id = int(target_id)
            filtered = [(enc, _id) for enc, _id in zip(known_encodings, known_ids) if int(_id) != target_id]
            known_encodings = [f[0] for f in filtered]
            known_ids = [f[1] for f in filtered]

        if not os.path.exists(DATASET_PATH):
            os.makedirs(DATASET_PATH)

        id_paths = [os.path.join(DATASET_PATH, f) for f in os.listdir(DATASET_PATH) if os.path.isdir(os.path.join(DATASET_PATH, f))]

        for id_path in id_paths:
            try:
                _id = int(os.path.split(id_path)[1])
            except ValueError:
                continue

            if target_id is not None and _id != target_id:
                continue

            if target_id is None and _id in set(known_ids):
                continue

            image_paths = [os.path.join(id_path, f) for f in os.listdir(id_path) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
            print(f"[INFO] Training student ID {_id}: found {len(image_paths)} images")

            for i, image_path in enumerate(image_paths):
                image = cv2.imread(image_path)
                if image is None:
                    continue
                try:
                    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                except cv2.error:
                    continue

                boxes = face_recognition.face_locations(rgb, model=DLIB_MODEL)
                encodings = face_recognition.face_encodings(rgb, boxes)
                for encoding in encodings:
                    known_encodings.append(encoding)
                    known_ids.append(_id)

        print("[INFO] serializing encodings...")
        data = {"encodings": known_encodings, "ids": known_ids}
        os.makedirs(os.path.dirname(ENCODINGS_FILE), exist_ok=True)
        with open(ENCODINGS_FILE, "wb") as f:
            f.write(pickle.dumps(data))
