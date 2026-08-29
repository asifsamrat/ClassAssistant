import json
from collections import deque, defaultdict
from typing import Dict, List, Any, Set, Tuple, Optional

class ConflictGraph:
    def __init__(self, students: List[Dict[str, Any]], courses: List[Dict[str, Any]], enrollments: List[Dict[str, Any]]):
        self.students = {str(s["id"]): s for s in students}
        self.courses = {str(c["code"]): c for c in courses}
        
        # Build mapping: course -> set of student_ids
        self.course_students: Dict[str, Set[str]] = defaultdict(set)
        # Build mapping: student_id -> set of course codes
        self.student_courses: Dict[str, Set[str]] = defaultdict(set)

        for en in enrollments:
            sid = str(en["student_id"])
            ccode = str(en["course_code"] if "course_code" in en else en.get("course_id", ""))
            self.course_students[ccode].add(sid)
            self.student_courses[sid].add(ccode)

        # Adjacency list: course_code -> list of dicts with conflict details
        self.adj: Dict[str, Dict[str, Set[str]]] = defaultdict(lambda: defaultdict(set))
        self._build_graph()

    def _build_graph(self):
        course_codes = list(self.courses.keys())
        for i in range(len(course_codes)):
            c1 = course_codes[i]
            for j in range(i + 1, len(course_codes)):
                c2 = course_codes[j]
                common_students = self.course_students[c1] & self.course_students[c2]
                if common_students:
                    self.adj[c1][c2] = common_students
                    self.adj[c2][c1] = common_students

    def get_degree(self, course_code: str) -> int:
        return len(self.adj[course_code])

    def to_dict(self) -> Dict[str, Any]:
        graph_nodes = []
        for code, course in self.courses.items():
            conflicts_list = []
            for neighbor_code, shared in self.adj[code].items():
                shared_names = [self.students[sid]["name"] for sid in shared if sid in self.students]
                conflicts_list.append({
                    "course": neighbor_code,
                    "course_name": self.courses[neighbor_code].get("name", neighbor_code),
                    "shared_count": len(shared),
                    "shared_students": shared_names
                })
            
            # Sort conflicts by shared count desc
            conflicts_list.sort(key=lambda x: x["shared_count"], reverse=True)

            graph_nodes.append({
                "code": code,
                "name": course.get("name", code),
                "section": course.get("section", "Section A"),
                "is_open_credit": course.get("is_open_credit", False),
                "student_count": len(self.course_students[code]),
                "conflict_degree": len(self.adj[code]),
                "conflicts": conflicts_list
            })

        # Sort nodes by conflict degree desc
        graph_nodes.sort(key=lambda x: x["conflict_degree"], reverse=True)
        return {
            "nodes": graph_nodes,
            "total_courses": len(graph_nodes),
            "total_students": len(self.students)
        }


class SmartExamScheduler:
    def __init__(
        self,
        students: List[Dict[str, Any]],
        courses: List[Dict[str, Any]],
        enrollments: List[Dict[str, Any]],
        slots: List[Dict[str, Any]],
        rooms: List[Dict[str, Any]]
    ):
        self.students = students
        self.courses = courses
        self.enrollments = enrollments
        self.slots = slots
        self.rooms = rooms

        self.conflict_graph = ConflictGraph(students, courses, enrollments)

        # Execution stats
        self.dfs_nodes_explored = 0
        self.bfs_nodes_explored = 0
        self.backtracks_count = 0
        self.trace_logs: List[Dict[str, Any]] = []

    def _log_trace(self, algo: str, status: str, message: str, details: Optional[Dict[str, Any]] = None):
        if len(self.trace_logs) < 300:  # limit trace array size for performance
            self.trace_logs.append({
                "step": len(self.trace_logs) + 1,
                "algorithm": algo,
                "status": status,
                "message": message,
                "details": details or {}
            })

    def bfs_find_alternative_slots(
        self,
        course_code: str,
        current_assignment: Dict[str, Dict[str, Any]],
        domain: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Use BFS to explore valid alternative slots systematically when a preferred slot causes a conflict.
        """
        self._log_trace("BFS", "SEARCH", f"Starting BFS alternative slot search for course {course_code}...")
        valid_alternatives = []
        queue = deque([(cand, 0) for cand in domain])  # (candidate, level)

        visited = set()

        while queue:
            self.bfs_nodes_explored += 1
            cand, level = queue.popleft()
            slot = cand["slot"]
            room = cand["room"]

            cand_key = f"{slot['id']}_{room['id']}"
            if cand_key in visited:
                continue
            visited.add(cand_key)

            is_valid, _ = self.check_hard_constraints(course_code, slot, room, current_assignment)
            if is_valid:
                valid_alternatives.append({
                    "slot": slot,
                    "room": room,
                    "level": level
                })
                self._log_trace(
                    "BFS",
                    "FOUND",
                    f"BFS Level {level}: Found valid alternative for {course_code} at Slot '{slot['slot_name']}' in Room {room['room_number']}"
                )
            
            # BFS branches to adjacent slots if not valid
            if len(valid_alternatives) >= 5:
                break

        return valid_alternatives

    def check_hard_constraints(
        self,
        course_code: str,
        slot: Dict[str, Any],
        room: Dict[str, Any],
        current_assignment: Dict[str, Dict[str, Any]]
    ) -> Tuple[bool, str]:
        """
        Check hard constraints for assigning course_code to (slot, room):
        1. Room capacity >= course student count.
        2. Room is not already booked in this slot.
        3. No student enrolled in course_code has another exam in this slot.
        """
        enrolled_students = self.conflict_graph.course_students[course_code]

        # 1. Room Capacity Constraint
        if len(enrolled_students) > room.get("capacity", 0):
            return False, f"Room {room['room_number']} capacity ({room['capacity']}) insufficient for {len(enrolled_students)} enrolled students."

        # Check existing assignments in current_assignment
        for assigned_code, assign in current_assignment.items():
            assigned_slot = assign["slot"]
            assigned_room = assign["room"]

            # 2. Room Overlap Constraint
            if assigned_slot["id"] == slot["id"] and assigned_room["id"] == room["id"]:
                return False, f"Room {room['room_number']} is already occupied by {assigned_code} at {slot['slot_name']}."

            # 3. Student Exam Conflict Constraint (Graph Edge check)
            if assigned_slot["id"] == slot["id"]:
                shared = enrolled_students & self.conflict_graph.course_students[assigned_code]
                if shared:
                    return False, f"Student conflict: {len(shared)} student(s) enrolled in both {course_code} and {assigned_code} at {slot['slot_name']}."

        return True, "Valid assignment"

    def solve(self) -> Dict[str, Any]:
        self.dfs_nodes_explored = 0
        self.bfs_nodes_explored = 0
        self.backtracks_count = 0
        self.trace_logs = []

        # Sort courses by heuristic: Highest Conflict Degree first (MRV + Degree Heuristic)
        course_codes = list(self.conflict_graph.courses.keys())
        course_codes.sort(
            key=lambda c: (self.conflict_graph.get_degree(c), len(self.conflict_graph.course_students[c])),
            reverse=True
        )

        # Create Domain: All possible (slot, room) pairs
        domain = []
        for slot in self.slots:
            # ensure slot object has slot_name
            s_obj = dict(slot)
            if "slot_name" not in s_obj:
                s_obj["slot_name"] = f"{s_obj.get('exam_date', '')} - {s_obj.get('start_time', '')}"
            for room in self.rooms:
                domain.append({"slot": s_obj, "room": room})

        self._log_trace("Backtracking", "START", f"Starting CSP Scheduler with {len(course_codes)} courses and {len(domain)} slot-room options.")

        current_assignment: Dict[str, Dict[str, Any]] = {}

        def backtrack_recursive(index: int) -> bool:
            if index >= len(course_codes):
                return True

            course_code = course_codes[index]
            self.dfs_nodes_explored += 1

            self._log_trace(
                "DFS",
                "CHOOSE",
                f"DFS Branching: Selecting course {course_code} (Degree: {self.conflict_graph.get_degree(course_code)}, Students: {len(self.conflict_graph.course_students[course_code])})"
            )

            # Sort domain for this course: prefer rooms closest to capacity to optimize room usage
            course_size = len(self.conflict_graph.course_students[course_code])
            sorted_domain = sorted(
                domain,
                key=lambda d: d["room"]["capacity"] - course_size if d["room"]["capacity"] >= course_size else 9999
            )

            attempted_conflicts = []

            for cand in sorted_domain:
                slot = cand["slot"]
                room = cand["room"]

                is_valid, reason = self.check_hard_constraints(course_code, slot, room, current_assignment)

                if is_valid:
                    current_assignment[course_code] = {"slot": slot, "room": room}
                    self._log_trace(
                        "Backtracking",
                        "ASSIGN",
                        f"Assigned {course_code} ➔ Slot '{slot['slot_name']}', Room '{room['room_number']}'"
                    )

                    if backtrack_recursive(index + 1):
                        return True

                    # Backtrack step
                    del current_assignment[course_code]
                    self.backtracks_count += 1
                    self._log_trace(
                        "Backtracking",
                        "BACKTRACK",
                        f"Backtracking: Undoing assignment of {course_code} from Slot '{slot['slot_name']}'"
                    )
                else:
                    attempted_conflicts.append(reason)

            # If no direct slot worked, demonstrate BFS alternative search for diagnostic trace
            self.bfs_find_alternative_slots(course_code, current_assignment, domain)
            return False

        success = backtrack_recursive(0)

        if success:
            return self._build_success_result(current_assignment)
        else:
            return self._build_failure_result(course_codes, domain)

    def _calculate_quality_score(self, assignment: Dict[str, Dict[str, Any]]) -> float:
        """
        Calculate Schedule Quality Score (0 to 100%):
        - Penalizes student multi-exam days (consecutive / same day exams).
        - Rewards even distribution of exams across available dates.
        - Rewards proper room capacity match.
        """
        if not assignment:
            return 0.0

        score = 100.0

        # Check student exams per day
        student_days = defaultdict(lambda: defaultdict(int))
        for course_code, assign in assignment.items():
            exam_date = assign["slot"].get("exam_date", "")
            for student_id in self.conflict_graph.course_students[course_code]:
                student_days[student_id][exam_date] += 1

        same_day_mult_count = 0
        for student_id, dates in student_days.items():
            for date, count in dates.items():
                if count > 1:
                    same_day_mult_count += (count - 1)

        # Deduct up to 30 points for student multiple exams per day
        same_day_penalty = min(30.0, same_day_mult_count * 5.0)
        score -= same_day_penalty

        # Room capacity fit penalty (deduct if room is overwhelmingly oversized e.g. capacity 100 for 2 students)
        oversized_penalty = 0.0
        for course_code, assign in assignment.items():
            students_cnt = len(self.conflict_graph.course_students[course_code])
            cap = assign["room"].get("capacity", 50)
            if cap > (students_cnt * 4) and cap > 40:
                oversized_penalty += 2.0
        score -= min(15.0, oversized_penalty)

        return max(10.0, round(score, 1))

    def _build_success_result(self, assignment: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        routine_items = []
        for course_code, assign in assignment.items():
            course = self.conflict_graph.courses[course_code]
            enrolled_student_ids = list(self.conflict_graph.course_students[course_code])
            enrolled_student_names = [
                self.conflict_graph.students[sid]["name"]
                for sid in enrolled_student_ids
                if sid in self.conflict_graph.students
            ]

            routine_items.append({
                "course_code": course_code,
                "course_name": course.get("name", course_code),
                "section": course.get("section", "Section A"),
                "is_open_credit": course.get("is_open_credit", False),
                "exam_date": assign["slot"].get("exam_date", ""),
                "start_time": assign["slot"].get("start_time", ""),
                "end_time": assign["slot"].get("end_time", ""),
                "slot_name": assign["slot"].get("slot_name", ""),
                "room_number": assign["room"].get("room_number", ""),
                "room_capacity": assign["room"].get("capacity", 0),
                "student_count": len(enrolled_student_ids),
                "students": enrolled_student_names
            })

        # Sort routine items by date, start_time, room
        routine_items.sort(key=lambda x: (x["exam_date"], x["start_time"], x["room_number"]))

        quality_score = self._calculate_quality_score(assignment)

        return {
            "status": "success",
            "message": "Smart Exam Routine successfully generated with 0 student conflicts!",
            "routine": routine_items,
            "conflict_graph": self.conflict_graph.to_dict(),
            "statistics": {
                "courses_scheduled": len(routine_items),
                "total_students": len(self.students),
                "student_conflicts": 0,
                "dfs_nodes_explored": self.dfs_nodes_explored,
                "bfs_nodes_explored": self.bfs_nodes_explored,
                "backtracks": self.backtracks_count,
                "hard_constraints_violated": 0,
                "schedule_quality_score": quality_score
            },
            "trace_logs": self.trace_logs
        }

    def _build_failure_result(self, course_codes: List[str], domain: List[Dict[str, Any]]) -> Dict[str, Any]:
        # Diagnostic analysis for failure
        reasons = []
        suggestions = []

        total_slots = len(self.slots)
        total_rooms = len(self.rooms)
        total_capacity_slots = total_slots * total_rooms

        if len(course_codes) > total_capacity_slots:
            reasons.append(
                f"Total courses ({len(course_codes)}) exceeds available room-slot capacity ({total_capacity_slots})."
            )
            suggestions.append("Add more exam time slots or introduce additional exam days.")
            suggestions.append("Add more exam rooms to accommodate concurrent exams.")

        # Check maximum conflict degree
        max_degree_course = max(course_codes, key=lambda c: self.conflict_graph.get_degree(c)) if course_codes else ""
        if max_degree_course:
            max_deg = self.conflict_graph.get_degree(max_degree_course)
            if max_deg >= total_slots:
                reasons.append(
                    f"Course '{max_degree_course}' has conflict degree {max_deg} (conflicts with {max_deg} other courses), "
                    f"which equals or exceeds total available time slots ({total_slots})."
                )
                suggestions.append(f"Increase time slots to at least {max_deg + 1} to schedule high-conflict courses.")

        # Check room capacity constraints
        for ccode in course_codes:
            cnt = len(self.conflict_graph.course_students[ccode])
            max_room_cap = max([r.get("capacity", 0) for r in self.rooms]) if self.rooms else 0
            if cnt > max_room_cap:
                reasons.append(
                    f"Course '{ccode}' has {cnt} enrolled students, but maximum room capacity is only {max_room_cap}."
                )
                suggestions.append(f"Increase room capacity for at least one room to at least {cnt}.")

        if not reasons:
            reasons.append("Dense student enrollment overlap created an over-constrained conflict graph.")
            suggestions.append("Spread exams across 1-2 additional exam dates or time slots.")

        return {
            "status": "failed",
            "message": "No valid exam routine could be generated without violating hard constraints.",
            "reasons": reasons,
            "suggestions": suggestions,
            "conflict_graph": self.conflict_graph.to_dict(),
            "statistics": {
                "courses_scheduled": 0,
                "total_students": len(self.students),
                "student_conflicts": -1,
                "dfs_nodes_explored": self.dfs_nodes_explored,
                "bfs_nodes_explored": self.bfs_nodes_explored,
                "backtracks": self.backtracks_count,
                "hard_constraints_violated": len(reasons),
                "schedule_quality_score": 0.0
            },
            "trace_logs": self.trace_logs
        }
