import React, { useState, useRef, useEffect } from "react";
import io from "socket.io-client";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import gubLogo from "./avatar/Logo.png";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Search,
  Camera,
  Download,
  Sparkles,
  BookOpen,
  LogOut,
  RefreshCw,
  FileText,
  Play,
  RotateCcw,
  Square,
  ChevronDown,
  ThumbsUp,
  Check,
  BarChart2
} from "lucide-react";

const socket = io(import.meta.env.VITE_API, {
  transports: ["websocket"],
  withCredentials: true,
});

export default function App() {
  const [activeTab, setActiveTab] = useState<"attendance" | "summary" | "absence_notices">("attendance");
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalId = useRef<ReturnType<typeof setInterval> | any>(null);
  const [processedImage, setProcessedImage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Courses & Selected Course State
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [absenceNotices, setAbsenceNotices] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);

  // Completed Detection Sessions State (key: `${courseId}_${date}` -> boolean)
  const [completedSessions, setCompletedSessions] = useState<Record<string, boolean>>({});

  // Approved Reason Messages State (Student ID -> boolean)
  const [approvedReasons, setApprovedReasons] = useState<Record<number, boolean>>({});

  const [logInfo, setLogInfo] = useState<{
    user: string | null;
    email: string | null;
    role: string;
  }>({
    user: "Faculty Member",
    email: "faculty@green.edu.bd",
    role: "faculty",
  });

  const navigate = useNavigate();

  const fetchFacultyData = async () => {
    setIsLoading(true);
    try {
      const stayRes = await axios.get(`${import.meta.env.VITE_API}/stay_signin`, {
        withCredentials: true,
      });
      if (stayRes.data.msg === "success") {
        setLogInfo({
          user: stayRes.data.name || "Faculty Member",
          email: stayRes.data.email || "faculty@green.edu.bd",
          role: stayRes.data.role || "faculty",
        });
        if (stayRes.data.role === "admin") {
          navigate("/admin/dashboard");
          return;
        }
      }

      // Fetch Real Courses from Database
      const resCourses = await axios.get(`${import.meta.env.VITE_API}/faculty/my_courses`, { withCredentials: true });
      const myCourses = resCourses.data || [];
      setCourses(myCourses);
      if (myCourses.length > 0 && !selectedCourse) {
        setSelectedCourse(myCourses[0]);
      }

      // Fetch Attendance Data
      const resAtt = await axios.get(`${import.meta.env.VITE_API}/get_attendance`, { withCredentials: true });
      setAttendanceData(resAtt.data || []);

      // Fetch Absence Notices (Reason Messages)
      const resNotices = await axios.get(`${import.meta.env.VITE_API}/faculty/absence_notices`, { withCredentials: true });
      setAbsenceNotices(resNotices.data || []);

    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFacultyData();
  }, []);

  const startCamera = async () => {
    if (!selectedCourse) {
      toast.error("Please select a course first");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;
      setShowCamera(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => console.error("Play error:", err));

          intervalId.current = setInterval(() => {
            const canvas = canvasRef.current;
            const video = videoRef.current;
            if (canvas && video && video.readyState === 4) {
              const context = canvas.getContext("2d");
              if (context) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(
                  (blob) => {
                    if (blob) {
                      blob.arrayBuffer().then((buffer) => {
                        socket.emit("client_frame", new Uint8Array(buffer));
                      });
                    }
                  },
                  "image/jpeg",
                  0.65
                );
              }
            }
          }, 350);
        }
      }, 300);

      socket.on("processed_frame", (buffer) => {
        const blob = new Blob([buffer], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        setProcessedImage(url);
      });
    } catch (err) {
      console.error("Error accessing camera:", err);
      toast.error("Failed to access webcam. Please allow camera permissions.");
    }
  };

  // Check if attendance has already been recorded for selectedDate and course
  const sessionKey = selectedCourse ? `${selectedCourse.id}_${selectedDate}` : "";
  const hasAttendanceRecorded =
    Boolean(completedSessions[sessionKey]) ||
    attendanceData.some((s) =>
      s.date_time?.dates?.some(
        (d: any) => d.attendance_date === selectedDate && (d.ck_time || d.time) && (d.ck_time !== "--" && d.time !== "--")
      )
    );

  const stopCamera = async () => {
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    socket.off("processed_frame");

    // Mark current course & date session as completed so button becomes "Retake Attendance"
    if (selectedCourse && selectedDate) {
      const key = `${selectedCourse.id}_${selectedDate}`;
      setCompletedSessions((prev) => ({ ...prev, [key]: true }));
    }

    fetchFacultyData();
  };

  const handleRetakeAttendance = () => {
    toast.info(`Retaking attendance for ${selectedDate}... Starting camera session.`);
    startCamera();
  };

  const toggleReasonApproval = (studentId: number) => {
    setApprovedReasons((prev) => {
      const nextState = !prev[studentId];
      if (nextState) {
        toast.success(`Reason approved (OK) for Student ID ${studentId}. Marked Present!`);
      } else {
        toast.info(`Reason approval revoked for Student ID ${studentId}.`);
      }
      return { ...prev, [studentId]: nextState };
    });
  };

  const handleSignOut = async () => {
    stopCamera();
    try {
      await axios.delete(`${import.meta.env.VITE_API}/signout`, { withCredentials: true });
    } catch (error) {
      // Ignore
    }
    navigate("/");
  };

  const todayStr = new Date().toISOString().split("T")[0];

  // Map absence notices by student name / ID for fast lookup
  const noticesMap = new Map<string, any>();
  absenceNotices.forEach((n) => {
    if (n.student_name) noticesMap.set(n.student_name.toLowerCase(), n);
    if (n.student_id) noticesMap.set(String(n.student_id), n);
  });

  const filteredNotices = absenceNotices.filter(
    (n) =>
      (n.student_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.course || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (n.reason || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Extract all distinct class dates recorded in database for attendance summary matrix
  const distinctClassDates = Array.from(
    new Set(
      attendanceData.flatMap((s) =>
        (s.date_time?.dates || [])
          .map((d: any) => d.attendance_date)
          .filter((dateStr: string) => dateStr && dateStr !== "--")
      )
    )
  ).sort();

  // Total classes array (show at least 10 class columns)
  const totalClassesCount = Math.max(10, distinctClassDates.length);
  const classHeaders = Array.from({ length: totalClassesCount }, (_, i) => `${i + 1}`);

  const exportSummaryPDF = () => {
    const doc = new jsPDF("landscape");
    doc.text(`Attendance Summary Matrix - ${selectedCourse?.code || "Course"}`, 14, 15);
    doc.text(`Generated on: ${todayStr}`, 14, 22);

    const tableHeaders = ["SL", "Student ID", "Student Name", ...classHeaders, "P", "A", "%"];
    const tableRows = attendanceData.map((s, idx) => {
      const studentDates = (s.date_time?.dates || []).map((d: any) => d.attendance_date);
      const isApproved = Boolean(approvedReasons[s.id]);

      let pCount = 0;
      let aCount = 0;

      const classStatuses = classHeaders.map((_, cIdx) => {
        const dateStr = distinctClassDates[cIdx];
        if (dateStr) {
          const isPresent = studentDates.includes(dateStr) || (dateStr === selectedDate && isApproved);
          if (isPresent) {
            pCount++;
            return "P";
          } else {
            aCount++;
            return "A";
          }
        } else {
          return "--";
        }
      });

      const totalHeld = pCount + aCount || 1;
      const pct = Math.round((pCount / totalHeld) * 100);

      return [idx + 1, s.id, s.name, ...classStatuses, pCount, aCount, `${pct}%`];
    });

    (doc as any).autoTable({
      head: [tableHeaders],
      body: tableRows,
      startY: 28,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 185, 129] },
    });

    doc.save(`Attendance_Summary_${selectedCourse?.code || "Course"}.pdf`);
  };

  return (
    <div className="min-h-screen bg-slate-50/60 flex font-sans text-slate-800">
      <ToastContainer position="top-right" autoClose={3000} />

      {/* LEFT SIDEBAR NAVIGATION */}
      <aside className="w-72 bg-white text-slate-800 flex flex-col border-r border-slate-200 shadow-sm shrink-0 h-screen sticky top-0">
        {/* University Logo Header */}
        <div className="p-6 border-b border-slate-100 flex items-center gap-3.5">
          <img src={gubLogo} alt="Green University Logo" className="h-12 w-auto" />
          <div>
            <h1 className="text-sm font-black tracking-tight text-emerald-600 leading-tight">Green University of Bangladesh</h1>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
          <div>
            <p className="text-[10px] font-extrabold tracking-wider text-slate-400 px-3 mb-3">
              Teacher Navigation
            </p>
            <nav className="space-y-1.5">
              {/* 1. Course Attendance */}
              <button
                onClick={() => {
                  setActiveTab("attendance");
                  setSearchQuery("");
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === "attendance"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <BookOpen className={`h-4.5 w-4.5 ${activeTab === "attendance" ? "text-emerald-600" : "text-slate-400"}`} />
                  <span>Course Attendance</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${activeTab === "attendance" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}>
                  {courses.length}
                </span>
              </button>

              {/* 2. Attendance Summary */}
              <button
                onClick={() => {
                  setActiveTab("summary");
                  setSearchQuery("");
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === "summary"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <BarChart2 className={`h-4.5 w-4.5 ${activeTab === "summary" ? "text-emerald-600" : "text-slate-400"}`} />
                  <span>Attendance Summary</span>
                </div>
              </button>

              {/* 3. Reason Messages */}
              <button
                onClick={() => {
                  setActiveTab("absence_notices");
                  setSearchQuery("");
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === "absence_notices"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <FileText className={`h-4.5 w-4.5 ${activeTab === "absence_notices" ? "text-emerald-600" : "text-slate-400"}`} />
                  <span>Reason Messages</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${activeTab === "absence_notices" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}>
                  {absenceNotices.length}
                </span>
              </button>
            </nav>
          </div>
        </div>

        {/* Bottom Faculty Profile Box */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 border border-emerald-200 shrink-0">
              <UserCheck className="h-5 w-5" />
            </div>
            <div className="overflow-hidden min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">{logInfo.user}</p>
              <p className="text-[10px] text-slate-500 font-mono truncate">{logInfo.email}</p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-600 py-2.5 rounded-xl text-xs font-bold transition-colors border border-slate-200 shadow-2xs"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* RIGHT SIDE MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Header Bar */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 shadow-xs">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              {activeTab === "attendance" && <>🎓 Class Attendance</>}
              {activeTab === "summary" && <>📊 Course Attendance Summary</>}
              {activeTab === "absence_notices" && <>📝 Student Absence Reason Messages</>}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-none w-52 sm:w-64 transition-all"
              />
            </div>

            <button
              onClick={fetchFacultyData}
              className="p-2.5 bg-white hover:bg-emerald-50 text-emerald-700 rounded-xl transition-colors border border-slate-200 shadow-2xs"
              title="Refresh Data"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        {/* Dynamic View Content Area */}
        <div className="p-8 space-y-6 flex-1">
          {/* VIEW 1: COURSE ATTENDANCE */}
          {activeTab === "attendance" && (
            <div className="space-y-6">
              {/* Single Horizontal Action Bar with "Course:" then Dropdown, "Date:" then Date Picker */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4 flex-1 min-w-[320px]">
                  {/* 1. Course: then Dropdown */}
                  <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-md">
                    <span className="text-xs font-black text-slate-800 shrink-0">Course:</span>
                    <div className="relative flex-1">
                      <select
                        value={selectedCourse?.id || ""}
                        onChange={(e) => {
                          const found = courses.find((c) => String(c.id) === e.target.value);
                          if (found) setSelectedCourse(found);
                        }}
                        className="w-full border-2 border-emerald-500/30 rounded-xl px-3.5 py-2.5 text-xs font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-emerald-50/50 text-slate-900 cursor-pointer transition-all shadow-xs appearance-none pr-9"
                      >
                        {courses.length === 0 ? (
                          <option value="">No courses available in database</option>
                        ) : (
                          courses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} - {c.title || c.name} {c.section ? `(Sec ${c.section})` : ""}
                            </option>
                          ))
                        )}
                      </select>
                      <ChevronDown className="h-4 w-4 text-emerald-600 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* 2. Date: then Dropdown / Date Picker */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-black text-slate-800 shrink-0">Date:</span>
                    <div className="relative">
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="border-2 border-emerald-500/30 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-emerald-50/30 text-slate-900 cursor-pointer shadow-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Action Buttons: Take Attendance vs Retake Attendance */}
                <div className="flex items-center gap-3 shrink-0">
                  {hasAttendanceRecorded ? (
                    <button
                      onClick={handleRetakeAttendance}
                      disabled={!selectedCourse}
                      className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-5 py-3 rounded-xl text-xs font-bold shadow-sm transition-colors"
                      title="Attendance already recorded for this date. Click to retake attendance."
                    >
                      <RotateCcw className="h-4 w-4" /> Retake Attendance
                    </button>
                  ) : (
                    <button
                      onClick={startCamera}
                      disabled={!selectedCourse}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-3 rounded-xl text-xs font-bold shadow-sm transition-colors"
                    >
                      <Play className="h-4 w-4 fill-white" /> Take Attendance
                    </button>
                  )}
                </div>
              </div>

              {/* Complete Attendance Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      {selectedCourse?.code || "--"} - {selectedCourse?.title || selectedCourse?.name || "--"}
                    </h3>
                    <p className="text-xs text-slate-600 font-medium mt-1">
                      Section: <span className="font-semibold text-slate-800">{selectedCourse?.section || "Sec A"}</span>
                    </p>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      Course Teacher Name: <span className="font-semibold text-slate-800">{logInfo.user || "Faculty Member"}</span>
                    </p>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Date: <span className="font-mono font-bold text-slate-700">{selectedDate}</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-[auto_auto_auto] items-center gap-x-2.5 gap-y-1.5 text-xs font-bold bg-slate-50/90 border border-slate-200 p-3 rounded-2xl shadow-2xs">
                    {/* Row 1: Total Student */}
                    <span className="text-slate-700 font-semibold text-left">Total Student</span>
                    <span className="text-slate-400 font-bold text-center">:</span>
                    <span className="text-slate-900 font-extrabold text-right px-2.5 py-0.5 bg-slate-200/80 rounded-md font-mono text-center">
                      {attendanceData.length}
                    </span>

                    {/* Row 2: Total Present */}
                    <span className="text-emerald-800 font-bold text-left">Total Present</span>
                    <span className="text-emerald-600 font-bold text-center">:</span>
                    <span className="text-emerald-900 font-extrabold text-right px-2.5 py-0.5 bg-emerald-100 border border-emerald-300/60 rounded-md font-mono text-center">
                      {
                        attendanceData.filter((s) => {
                          const todayEntry = s.date_time?.dates?.find((d: any) => d.attendance_date === selectedDate);
                          return Boolean(todayEntry) || Boolean(approvedReasons[s.id]);
                        }).length
                      }
                    </span>

                    {/* Row 3: Total Absent */}
                    <span className="text-red-800 font-bold text-left">Total Absent</span>
                    <span className="text-red-600 font-bold text-center">:</span>
                    <span className="text-red-900 font-extrabold text-right px-2.5 py-0.5 bg-red-100 border border-red-300/60 rounded-md font-mono text-center">
                      {
                        attendanceData.filter((s) => {
                          const todayEntry = s.date_time?.dates?.find((d: any) => d.attendance_date === selectedDate);
                          return !Boolean(todayEntry) && !Boolean(approvedReasons[s.id]);
                        }).length
                      }
                    </span>
                  </div>
                </div>

                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-bold tracking-wider border-b border-slate-200">
                      <th className="px-4 py-3.5 text-center">SL</th>
                      <th className="px-4 py-3.5">Student ID</th>
                      <th className="px-4 py-3.5">Student Name</th>
                      <th className="px-4 py-3.5 text-center">Total Held</th>
                      <th className="px-4 py-3.5 text-center">Total Present</th>
                      <th className="px-4 py-3.5 text-center">Total Absent</th>
                      <th className="px-4 py-3.5 text-center">Attendance Status</th>
                      <th className="px-5 py-3.5">Student Reason Message</th>
                      <th className="px-4 py-3.5 text-right">Reason Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {attendanceData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                          No student attendance records loaded. Select a course and click <strong>"Take Attendance"</strong>.
                        </td>
                      </tr>
                    ) : (
                      attendanceData
                        .filter(
                          (s) =>
                            String(s.id).includes(searchQuery) ||
                            (s.name || "").toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((s, idx) => {
                          const todayEntry = s.date_time?.dates?.find((d: any) => d.attendance_date === selectedDate);
                          const isDetectedInLive = Boolean(todayEntry);
                          const isReasonApproved = Boolean(approvedReasons[s.id]);

                          const isPresentToday = isDetectedInLive || isReasonApproved;
                          const noticeObj = noticesMap.get(String(s.id)) || noticesMap.get((s.name || "").toLowerCase());
                          const reasonText = noticeObj?.reason || "--";

                          const datesArr = s.date_time?.dates || [];
                          const totalPresent = isPresentToday ? Math.max(1, datesArr.length) : datesArr.length;
                          const totalHeld = 20;
                          const totalAbsent = Math.max(0, totalHeld - totalPresent);

                          return (
                            <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3.5 text-center font-bold text-slate-400 font-mono">
                                {idx + 1}
                              </td>

                              <td className="px-4 py-3.5 font-mono font-bold text-emerald-700">
                                {s.id}
                              </td>

                              <td className="px-4 py-3.5 font-semibold text-slate-900">
                                {s.name}
                              </td>

                              <td className="px-4 py-3.5 text-center font-mono font-bold text-slate-600">
                                {totalHeld}
                              </td>

                              <td className="px-4 py-3.5 text-center font-mono font-bold text-emerald-700">
                                {totalPresent}
                              </td>

                              <td className="px-4 py-3.5 text-center font-mono font-bold text-red-600">
                                {totalAbsent}
                              </td>

                              <td className="px-4 py-3.5 text-center">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${isPresentToday
                                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  : "bg-red-100 text-red-800 border border-red-200"
                                  }`}>
                                  {isPresentToday ? (
                                    <>
                                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> Present
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-3.5 w-3.5 text-red-600" /> Absent
                                    </>
                                  )}
                                </span>
                              </td>

                              <td className="px-5 py-3.5 text-slate-600 max-w-xs truncate">
                                {reasonText !== "--" ? (
                                  <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded-md text-[11px] font-medium border border-slate-200 inline-block truncate max-w-full">
                                    {reasonText}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-mono">--</span>
                                )}
                              </td>

                              <td className="px-4 py-3.5 text-right">
                                {reasonText !== "--" ? (
                                  <button
                                    onClick={() => toggleReasonApproval(s.id)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all border shadow-2xs ${isReasonApproved
                                      ? "bg-emerald-600 text-white border-emerald-700"
                                      : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300"
                                      }`}
                                    title="Click to approve absence reason (Marks student Present)"
                                  >
                                    {isReasonApproved ? (
                                      <>
                                        <Check className="h-3 w-3 stroke-[3]" /> Approved (OK)
                                      </>
                                    ) : (
                                      <>
                                        <ThumbsUp className="h-3 w-3 text-amber-600" /> Approve Reason (OK)
                                      </>
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-slate-400 text-[10px] font-mono">No Reason</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>

              </div>
            </div>
          )}

          {/* VIEW 2: ATTENDANCE SUMMARY MATRIX (CLASS SERIALS + STUDENT P/A) */}
          {activeTab === "summary" && (
            <div className="space-y-6">
              {/* Single Horizontal Action Bar */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-md">
                  <span className="text-xs font-black text-slate-800 shrink-0">Course:</span>
                  <div className="relative flex-1">
                    <select
                      value={selectedCourse?.id || ""}
                      onChange={(e) => {
                        const found = courses.find((c) => String(c.id) === e.target.value);
                        if (found) setSelectedCourse(found);
                      }}
                      className="w-full border-2 border-emerald-500/30 rounded-xl px-3.5 py-2.5 text-xs font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-emerald-50/50 text-slate-900 cursor-pointer transition-all shadow-xs appearance-none pr-9"
                    >
                      {courses.length === 0 ? (
                        <option value="">No courses available in database</option>
                      ) : (
                        courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} - {c.title || c.name} {c.section ? `(Sec ${c.section})` : ""}
                          </option>
                        ))
                      )}
                    </select>
                    <ChevronDown className="h-4 w-4 text-emerald-600 absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>

                <button
                  onClick={exportSummaryPDF}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-colors shrink-0"
                >
                  <Download className="h-4 w-4" /> Download Summary PDF
                </button>
              </div>

              {/* Class-by-Class Attendance Matrix Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      {selectedCourse?.code || "--"} - {selectedCourse?.title || selectedCourse?.name || "--"}
                    </h3>
                    <p className="text-xs text-slate-600 font-medium mt-1">
                      Section: <span className="font-semibold text-slate-800">{selectedCourse?.section || "Sec A"}</span>
                    </p>
                    <p className="text-xs text-slate-600 font-medium mt-0.5">
                      Course Teacher Name: <span className="font-semibold text-slate-800">{logInfo.user || "Faculty Member"}</span>
                    </p>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Date: <span className="font-mono font-bold text-slate-700">{selectedDate}</span>
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-mono font-bold">
                    Class Sessions Recorded: {distinctClassDates.length}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs font-bold tracking-wider border-b border-slate-200">
                        <th className="px-4 py-3.5 text-center">SL</th>
                        <th className="px-4 py-3.5">Student ID</th>
                        <th className="px-4 py-3.5">Student Name</th>

                        {/* Class Serial Headers (Class 1, Class 2 ... Class N) */}
                        {classHeaders.map((headerText, cIdx) => (
                          <th key={cIdx} className="px-3 py-3.5 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center">
                              <span>{headerText}</span>
                              {distinctClassDates[cIdx] && (
                                <span className="text-[9px] font-mono text-emerald-600 font-normal lowercase">
                                  {distinctClassDates[cIdx]}
                                </span>
                              )}
                            </div>
                          </th>
                        ))}

                        <th className="px-3 py-3.5 text-center font-extrabold text-emerald-700">Total P</th>
                        <th className="px-3 py-3.5 text-center font-extrabold text-red-600">Total A</th>
                        <th className="px-4 py-3.5 text-right font-extrabold text-slate-900">Attendance %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {attendanceData.length === 0 ? (
                        <tr>
                          <td colSpan={totalClassesCount + 6} className="px-6 py-12 text-center text-slate-500">
                            No attendance records available for summary.
                          </td>
                        </tr>
                      ) : (
                        attendanceData
                          .filter(
                            (s) =>
                              String(s.id).includes(searchQuery) ||
                              (s.name || "").toLowerCase().includes(searchQuery.toLowerCase())
                          )
                          .map((s, idx) => {
                            const studentDates = (s.date_time?.dates || []).map((d: any) => d.attendance_date);
                            const isApproved = Boolean(approvedReasons[s.id]);

                            let pCount = 0;
                            let aCount = 0;

                            const classCells = classHeaders.map((_, cIdx) => {
                              const dateStr = distinctClassDates[cIdx];
                              if (dateStr) {
                                const isPresent = studentDates.includes(dateStr) || (dateStr === selectedDate && isApproved);
                                if (isPresent) {
                                  pCount++;
                                  return (
                                    <td key={cIdx} className="px-3 py-3.5 text-center">
                                      <span className="inline-block w-6 h-6 leading-6 rounded-md bg-emerald-100 text-emerald-800 font-extrabold text-[11px] border border-emerald-300/60 shadow-2xs">
                                        P
                                      </span>
                                    </td>
                                  );
                                } else {
                                  aCount++;
                                  return (
                                    <td key={cIdx} className="px-3 py-3.5 text-center">
                                      <span className="inline-block w-6 h-6 leading-6 rounded-md bg-red-100 text-red-800 font-extrabold text-[11px] border border-red-300/60 shadow-2xs">
                                        A
                                      </span>
                                    </td>
                                  );
                                }
                              } else {
                                return (
                                  <td key={cIdx} className="px-3 py-3.5 text-center text-slate-300 font-mono">
                                    --
                                  </td>
                                );
                              }
                            });

                            const totalHeld = pCount + aCount || 1;
                            const pct = Math.round((pCount / totalHeld) * 100);

                            return (
                              <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-3.5 text-center font-bold text-slate-400 font-mono">
                                  {idx + 1}
                                </td>

                                <td className="px-4 py-3.5 font-mono font-bold text-emerald-700">
                                  {s.id}
                                </td>

                                <td className="px-4 py-3.5 font-semibold text-slate-900 whitespace-nowrap">
                                  {s.name}
                                </td>

                                {/* Class Serial P/A Cells */}
                                {classCells}

                                {/* Total P */}
                                <td className="px-3 py-3.5 text-center font-mono font-extrabold text-emerald-700 bg-emerald-50/30">
                                  {pCount}
                                </td>

                                {/* Total A */}
                                <td className="px-3 py-3.5 text-center font-mono font-extrabold text-red-600 bg-red-50/30">
                                  {aCount}
                                </td>

                                {/* Percentage */}
                                <td className="px-4 py-3.5 text-right font-mono font-extrabold text-slate-900">
                                  <span className={`px-2 py-1 rounded-md text-[11px] ${pct >= 75 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                    }`}>
                                    {pct}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: REASON MESSAGES */}
          {activeTab === "absence_notices" && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">Student Submitted Reason Messages</h3>
                <p className="text-xs text-slate-500 mt-0.5">Absence notices & reason messages submitted by students.</p>
              </div>

              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs font-bold tracking-wider border-b border-slate-200">
                    <th className="px-6 py-4">Student Name</th>
                    <th className="px-6 py-4">Course</th>
                    <th className="px-6 py-4">Absence Date</th>
                    <th className="px-6 py-4">Reason Message</th>
                    <th className="px-6 py-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredNotices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                        No student absence reason messages submitted yet.
                      </td>
                    </tr>
                  ) : (
                    filteredNotices.map((n) => (
                      <tr key={n.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-900">{n.student_name}</td>
                        <td className="px-6 py-4 font-mono font-bold text-emerald-700">{n.course}</td>
                        <td className="px-6 py-4 text-slate-700 font-medium">{n.date}</td>
                        <td className="px-6 py-4 text-slate-600 text-xs max-w-md">{n.reason}</td>
                        <td className="px-6 py-4 text-right">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            {n.status || "Submitted"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* DUAL-BOX LIVE ATTENDANCE CAMERA MODAL */}
      {showCamera && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 space-y-6 border border-slate-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Camera className="h-5 w-5 text-emerald-600" /> Live Detection for ({selectedCourse?.code})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Attendence Recognition Session for {selectedCourse?.title}
                </p>
              </div>
              <button
                onClick={stopCamera}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Dual Box Video & Processed Frame Viewport */}
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              {/* Left Box: Live Camera Stream */}
              <div className="w-full sm:w-[320px] h-[240px] border-2 border-emerald-500 rounded-2xl overflow-hidden relative bg-slate-950 shadow-inner">
                <video
                  ref={videoRef}
                  muted
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} width="320" height="240" className="hidden" />
                <div className="absolute bottom-2 left-2 bg-slate-900/80 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white">
                  Live Camera Feed
                </div>
              </div>

              {/* Right Box: OpenCV Processed Frame with Bounding Box */}
              <div className="w-full sm:w-[320px] h-[240px] border-2 border-emerald-500 rounded-2xl overflow-hidden relative bg-slate-950 shadow-inner flex items-center justify-center">
                {processedImage ? (
                  <img
                    src={processedImage}
                    alt="AI Recognition Frame"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center p-4 text-xs text-slate-400 space-y-2">
                    <Sparkles className="h-6 w-6 text-emerald-400 mx-auto animate-spin" />
                    <p>Detecting faces in classroom...</p>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-emerald-900/90 px-2.5 py-1 rounded-lg text-[10px] font-bold text-emerald-200">
                  OpenCV AI Detection
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-500 font-medium">
                Scanning classroom faces for {selectedCourse?.code}... Attendance saved automatically.
              </span>
              <button
                onClick={stopCamera}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm flex items-center gap-2"
              >
                <Square className="h-3.5 w-3.5 fill-white" /> Stop Live Detection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
