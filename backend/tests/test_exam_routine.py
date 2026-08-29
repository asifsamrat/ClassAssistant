import sys
import os
import unittest

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.libs.exam_scheduler import SmartExamScheduler, ConflictGraph

class TestSmartExamScheduler(unittest.TestCase):

    def test_1_no_student_conflicts(self):
        """Test 1: No student has conflicting courses -> All courses can potentially use the same slot if rooms permit."""
        students = [{"id": 1, "name": "S1"}, {"id": 2, "name": "S2"}]
        courses = [
            {"code": "CSE101", "name": "Programming", "section": "A"},
            {"code": "CSE102", "name": "Data Structures", "section": "A"}
        ]
        # Student 1 in CSE101, Student 2 in CSE102 (no shared student)
        enrollments = [
            {"student_id": 1, "course_code": "CSE101"},
            {"student_id": 2, "course_code": "CSE102"}
        ]
        slots = [{"id": 1, "exam_date": "Day 1", "start_time": "10:00 AM", "end_time": "12:00 PM"}]
        rooms = [
            {"id": 1, "room_number": "101", "capacity": 50},
            {"id": 2, "room_number": "102", "capacity": 50}
        ]

        scheduler = SmartExamScheduler(students, courses, enrollments, slots, rooms)
        res = scheduler.solve()
        self.assertEqual(res["status"], "success")
        self.assertEqual(len(res["routine"]), 2)
        # Both courses scheduled in Slot 1 in different rooms
        self.assertEqual(res["routine"][0]["exam_date"], "Day 1")
        self.assertEqual(res["routine"][1]["exam_date"], "Day 1")

    def test_2_two_courses_share_students(self):
        """Test 2: Two courses share students -> Must receive different slots."""
        students = [{"id": 1, "name": "S1"}]
        courses = [
            {"code": "CSE101", "name": "Programming", "section": "A"},
            {"code": "CSE102", "name": "Data Structures", "section": "A"}
        ]
        # Student 1 in BOTH CSE101 and CSE102
        enrollments = [
            {"student_id": 1, "course_code": "CSE101"},
            {"student_id": 1, "course_code": "CSE102"}
        ]
        slots = [
            {"id": 1, "exam_date": "Day 1", "start_time": "10:00 AM", "end_time": "12:00 PM"},
            {"id": 2, "exam_date": "Day 1", "start_time": "02:00 PM", "end_time": "04:00 PM"}
        ]
        rooms = [{"id": 1, "room_number": "101", "capacity": 50}]

        scheduler = SmartExamScheduler(students, courses, enrollments, slots, rooms)
        res = scheduler.solve()
        self.assertEqual(res["status"], "success")

        slot_names = [item["slot_name"] for item in res["routine"]]
        self.assertNotEqual(slot_names[0], slot_names[1], "Conflicting courses must be in different slots!")

    def test_3_open_credit_cross_section_conflicts(self):
        """Test 3: Multiple sections with open-credit courses -> Cross-section conflicts detected."""
        students = [
            {"id": 1, "name": "S1"},
            {"id": 2, "name": "S2"}
        ]
        courses = [
            {"code": "CSE101", "name": "Programming", "section": "Section A", "is_open_credit": False},
            {"code": "CSE103", "name": "Math", "section": "Section B", "is_open_credit": False},
            {"code": "CSE201", "name": "Algorithms", "section": "Open Credit", "is_open_credit": True}
        ]
        # S1 in Section A (CSE101) & Open Credit (CSE201)
        # S2 in Section B (CSE103) & Open Credit (CSE201)
        enrollments = [
            {"student_id": 1, "course_code": "CSE101"},
            {"student_id": 1, "course_code": "CSE201"},
            {"student_id": 2, "course_code": "CSE103"},
            {"student_id": 2, "course_code": "CSE201"}
        ]
        slots = [
            {"id": 1, "exam_date": "Day 1", "start_time": "10:00 AM", "end_time": "12:00 PM"},
            {"id": 2, "exam_date": "Day 1", "start_time": "02:00 PM", "end_time": "04:00 PM"},
            {"id": 3, "exam_date": "Day 2", "start_time": "10:00 AM", "end_time": "12:00 PM"}
        ]
        rooms = [{"id": 1, "room_number": "101", "capacity": 50}]

        scheduler = SmartExamScheduler(students, courses, enrollments, slots, rooms)
        res = scheduler.solve()
        self.assertEqual(res["status"], "success")
        
        # Verify CSE201 has conflicts with both CSE101 and CSE103
        graph = res["conflict_graph"]
        cse201_node = next(n for n in graph["nodes"] if n["code"] == "CSE201")
        self.assertEqual(cse201_node["conflict_degree"], 2)

    def test_4_insufficient_slots(self):
        """Test 4: Insufficient slots -> Scheduler reports no valid solution with reasons and suggestions."""
        students = [{"id": 1, "name": "S1"}]
        courses = [
            {"code": "CSE101", "name": "Programming", "section": "A"},
            {"code": "CSE102", "name": "Data Structures", "section": "A"}
        ]
        # Shared student S1
        enrollments = [
            {"student_id": 1, "course_code": "CSE101"},
            {"student_id": 1, "course_code": "CSE102"}
        ]
        # Only 1 slot available for 2 conflicting courses!
        slots = [{"id": 1, "exam_date": "Day 1", "start_time": "10:00 AM", "end_time": "12:00 PM"}]
        rooms = [{"id": 1, "room_number": "101", "capacity": 50}]

        scheduler = SmartExamScheduler(students, courses, enrollments, slots, rooms)
        res = scheduler.solve()
        self.assertEqual(res["status"], "failed")
        self.assertTrue(len(res["reasons"]) > 0)
        self.assertTrue(len(res["suggestions"]) > 0)

    def test_5_room_capacity_limitation(self):
        """Test 5: Room capacity limitation -> Courses assigned only to suitable rooms."""
        students = [{"id": i, "name": f"S{i}"} for i in range(1, 31)] # 30 students
        courses = [{"code": "CSE101", "name": "Large Class", "section": "A"}]
        enrollments = [{"student_id": i, "course_code": "CSE101"} for i in range(1, 31)]
        
        slots = [{"id": 1, "exam_date": "Day 1", "start_time": "10:00 AM", "end_time": "12:00 PM"}]
        # Room 101 has cap 20 (too small), Room 102 has cap 40 (fits)
        rooms = [
            {"id": 1, "room_number": "101", "capacity": 20},
            {"id": 2, "room_number": "102", "capacity": 40}
        ]

        scheduler = SmartExamScheduler(students, courses, enrollments, slots, rooms)
        res = scheduler.solve()
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["routine"][0]["room_number"], "102")

    def test_6_large_dataset_performance(self):
        """Test 6: Large dataset -> Measure DFS nodes, BFS nodes, Backtracks count, execution metrics."""
        students = [{"id": i, "name": f"Student_{i}"} for i in range(1, 51)] # 50 students
        courses = [{"code": f"CSE{100+i}", "name": f"Course_{i}", "section": f"Sec_{i%3}"} for i in range(1, 11)] # 10 courses
        
        enrollments = []
        for s in students:
            # Each student enrolled in 2-3 courses
            c1 = f"CSE{100 + (s['id'] % 10) + 1}"
            c2 = f"CSE{100 + ((s['id'] + 3) % 10) + 1}"
            enrollments.append({"student_id": s["id"], "course_code": c1})
            enrollments.append({"student_id": s["id"], "course_code": c2})

        slots = [
            {"id": 1, "exam_date": "Day 1", "start_time": "10:00 AM", "end_time": "12:00 PM"},
            {"id": 2, "exam_date": "Day 1", "start_time": "02:00 PM", "end_time": "04:00 PM"},
            {"id": 3, "exam_date": "Day 2", "start_time": "10:00 AM", "end_time": "12:00 PM"},
            {"id": 4, "exam_date": "Day 2", "start_time": "02:00 PM", "end_time": "04:00 PM"},
            {"id": 5, "exam_date": "Day 3", "start_time": "10:00 AM", "end_time": "12:00 PM"}
        ]
        rooms = [
            {"id": 1, "room_number": "101", "capacity": 40},
            {"id": 2, "room_number": "102", "capacity": 40}
        ]

        scheduler = SmartExamScheduler(students, courses, enrollments, slots, rooms)
        res = scheduler.solve()
        self.assertIn("statistics", res)
        stats = res["statistics"]
        self.assertGreaterEqual(stats["dfs_nodes_explored"], 1)
        print(f"\n[BENCHMARK] DFS Nodes: {stats['dfs_nodes_explored']}, BFS Nodes: {stats['bfs_nodes_explored']}, Backtracks: {stats['backtracks']}, Quality: {stats['schedule_quality_score']}%")

if __name__ == "__main__":
    unittest.main()
