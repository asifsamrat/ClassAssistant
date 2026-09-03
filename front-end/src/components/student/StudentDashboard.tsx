import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import gubLogo from '../../avatar/Logo.png';
import {
  GraduationCap,
  BookOpen,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Send,
  LogOut,
  RefreshCw,
  Search,
  Plus,
  Camera,
  CameraOff,
  Sparkles,
  Check
} from 'lucide-react';

const socket = io(import.meta.env.VITE_API, {
  transports: ['polling', 'websocket'],
  withCredentials: true,
});

export const StudentDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'attendance' | 'absence_notice' | 'face_registration'>('attendance');
  const [studentInfo, setStudentInfo] = useState<{
    id: string | number;
    name: string;
    courses: string[];
    is_face_registered?: boolean;
    registered_samples_count?: number;
  }>({
    id: '--',
    name: 'Student User',
    courses: [],
    is_face_registered: false,
    registered_samples_count: 0
  });
  const [courseStats, setCourseStats] = useState<Array<any>>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<Array<any>>([]);
  const [absenceNotices, setAbsenceNotices] = useState<Array<any>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Absence Notice Form State
  const [selectedCourse, setSelectedCourse] = useState('');
  const [noticeDate, setNoticeDate] = useState('');
  const [noticeReason, setNoticeReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Face Registration Camera & Socket State
  const [regStep, setRegStep] = useState<'idle' | 'capturing' | 'training' | 'complete'>('idle');
  const [capturedCount, setCapturedCount] = useState(0);
  const [regStatusMsg, setRegStatusMsg] = useState('Click below to initialize your webcam & capture face samples.');
  const [regProcessedFrameUrl, setRegProcessedFrameUrl] = useState<string | null>(null);

  const regStreamRef = useRef<MediaStream | null>(null);
  const regVideoRef = useRef<HTMLVideoElement | null>(null);
  const regCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const regIntervalId = useRef<any>(null);

  const navigate = useNavigate();

  const fetchStudentData = async () => {
    setIsLoading(true);
    try {
      // Verify login status
      const stayRes = await axios.get(`${import.meta.env.VITE_API}/stay_signin`, { withCredentials: true });
      if (stayRes.data.msg !== 'success') {
        toast.error('Session expired. Please log in.');
        navigate('/student');
        return;
      }

      // Fetch portal data
      const portalRes = await axios.get(`${import.meta.env.VITE_API}/student/portal_data`, { withCredentials: true });
      if (portalRes.data.msg === 'success') {
        setStudentInfo(portalRes.data.student || { id: '--', name: 'Student', courses: [], is_face_registered: false });
        setCourseStats(portalRes.data.course_stats || []);
        setAttendanceLogs(portalRes.data.attendance_logs || []);
        setAbsenceNotices(portalRes.data.absence_notices || []);
        if (portalRes.data.course_stats?.length > 0 && !selectedCourse) {
          setSelectedCourse(portalRes.data.course_stats[0].code);
        }
      }
    } catch (err: any) {
      console.error('Student portal error:', err);
      if (err.response?.status === 401) {
        navigate('/student');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();

    // Socket.io Face Registration Listeners
    const handleProgress = (data: any) => {
      if (!data) return;
      setCapturedCount(data.captured_count || 0);
      if (data.status === 'training') {
        setRegStep('training');
        setRegStatusMsg('Training AI Classifier Model... Please hold on!');
      } else {
        setRegStep('capturing');
        setRegStatusMsg(`Capturing face samples (${data.captured_count}/15)... Turn head slightly for varied angles.`);
      }
    };

    const handleProcessedFrame = (buffer: ArrayBuffer) => {
      const blob = new Blob([buffer], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      setRegProcessedFrameUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    };

    const handleComplete = (data: any) => {
      stopRegCamera();
      setRegStep('complete');
      setCapturedCount(15);
      setRegStatusMsg('Face registration complete & AI model trained successfully!');
      toast.success('Face registered and AI model trained for Teacher Portal detection!');
      fetchStudentData();
    };

    socket.on('register_progress', handleProgress);
    socket.on('register_processed_frame', handleProcessedFrame);
    socket.on('register_complete', handleComplete);

    return () => {
      socket.off('register_progress', handleProgress);
      socket.off('register_processed_frame', handleProcessedFrame);
      socket.off('register_complete', handleComplete);
      stopRegCamera();
    };
  }, []);

  const stopRegCamera = () => {
    if (regIntervalId.current) {
      clearInterval(regIntervalId.current);
      regIntervalId.current = null;
    }
    if (regStreamRef.current) {
      regStreamRef.current.getTracks().forEach((track) => track.stop());
      regStreamRef.current = null;
    }
  };

  const startFaceRegistration = async () => {
    stopRegCamera();
    setRegStep('capturing');
    setCapturedCount(0);
    setRegStatusMsg('Initializing backend face registration & starting camera...');

    let activeStudentId = studentInfo.id;

    try {
      const res = await axios.post(`${import.meta.env.VITE_API}/student/start_face_registration`, {}, { withCredentials: true });
      if (res.data?.student_id) {
        activeStudentId = res.data.student_id;
      }
    } catch (apiErr) {
      console.warn('Backend face registration init warning:', apiErr);
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
      } catch (e1) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      regStreamRef.current = stream;

      setTimeout(() => {
        if (regVideoRef.current) {
          regVideoRef.current.srcObject = stream;
          regVideoRef.current.play().catch((err) => console.error('Video play error:', err));

          regIntervalId.current = setInterval(() => {
            const canvas = regCanvasRef.current;
            const video = regVideoRef.current;
            if (canvas && video && video.readyState === 4) {
              const context = canvas.getContext('2d');
              if (context) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(
                  (blob) => {
                    if (blob) {
                      blob.arrayBuffer().then((buffer) => {
                        socket.emit('register_capture_frame', {
                          student_id: activeStudentId,
                          frame: new Uint8Array(buffer),
                        });
                      });
                    }
                  },
                  'image/jpeg',
                  0.75
                );
              }
            }
          }, 350);
        }
      }, 300);
    } catch (err: any) {
      console.error('Camera capture error:', err);
      let errorMsg = 'Failed to access webcam.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'Camera permission denied. Click camera icon in address bar to allow.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = 'Camera in use by another tab or program. Please close other camera tabs.';
      }
      toast.error(errorMsg);
      setRegStep('idle');
      setRegStatusMsg(errorMsg);
      stopRegCamera();
    }
  };

  const handleSignOut = async () => {
    stopRegCamera();
    try {
      await axios.delete(`${import.meta.env.VITE_API}/signout`, { withCredentials: true });
    } catch (e) {
      // Ignore
    }
    navigate('/student');
  };

  const handleNoticeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !noticeDate || !noticeReason) {
      toast.error('Please fill in Course, Date, and Reason for absence');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API}/student/absence_notice`,
        {
          course: selectedCourse,
          date: noticeDate,
          reason: noticeReason
        },
        { withCredentials: true }
      );
      if (res.data.msg === 'success') {
        toast.success('Absence notice submitted successfully!');
        setNoticeReason('');
        setNoticeDate('');
        fetchStudentData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.msg || 'Failed to submit notice');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered courses based on search
  const filteredCourseStats = courseStats.filter(
    (c) =>
      (c.code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-3 mb-3">
              Academic Dashboard
            </p>
            <nav className="space-y-1.5">
              {/* 1. Course Attendance */}
              <button
                onClick={() => { setActiveTab('attendance'); setSearchQuery(''); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === 'attendance'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <BookOpen className={`h-4.5 w-4.5 ${activeTab === 'attendance' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>Course Attendance</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${activeTab === 'attendance' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                  {courseStats.length}
                </span>
              </button>

              {/* 2. Report Class Absence */}
              <button
                onClick={() => { setActiveTab('absence_notice'); setSearchQuery(''); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === 'absence_notice'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <FileText className={`h-4.5 w-4.5 ${activeTab === 'absence_notice' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>Report Class Absence</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${activeTab === 'absence_notice' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                  {absenceNotices.length}
                </span>
              </button>

              {/* 3. Face AI Registration (BELOW REPORT CLASS ABSENCE) */}
              <button
                onClick={() => { setActiveTab('face_registration'); setSearchQuery(''); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all ${activeTab === 'face_registration'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <Camera className={`h-4.5 w-4.5 ${activeTab === 'face_registration' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>Face Registration</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${studentInfo.is_face_registered
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
                  }`}>
                  {studentInfo.is_face_registered ? 'Trained' : 'Action Needed'}
                </span>
              </button>
            </nav>
          </div>
        </div>

        {/* Bottom Student Profile & Logout */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 border border-emerald-200 shrink-0">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="overflow-hidden min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">{studentInfo.name}</p>
              <p className="text-[10px] text-slate-500 font-mono truncate">ID: {studentInfo.id}</p>
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
              {activeTab === 'attendance' && <>🎓 Course-wise Attendance Overview</>}
              {activeTab === 'absence_notice' && <>📝 Report Class Absence</>}
              {activeTab === 'face_registration' && <>📸 Face Image Capturing</>}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'attendance' && (
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search course..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-none w-52 sm:w-64 transition-all"
                />
              </div>
            )}

            <button
              onClick={fetchStudentData}
              className="p-2.5 bg-white hover:bg-emerald-50 text-emerald-700 rounded-xl transition-colors border border-slate-200 shadow-2xs"
              title="Refresh Data"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {activeTab === 'attendance' && (
              <button
                onClick={() => setActiveTab('absence_notice')}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors"
              >
                <Plus className="h-4 w-4" /> Submit Absence Notice
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Main View Area */}
        <div className="p-8 space-y-6 flex-1">
          {/* TAB 1: COURSE-WISE ATTENDANCE OVERVIEW */}
          {activeTab === 'attendance' && (
            <div className="space-y-6">
              {/* Course Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredCourseStats.map((c) => (
                  <div key={c.code} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 hover:border-emerald-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                          {c.code}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 mt-2 line-clamp-1">{c.title}</h3>
                      </div>

                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0 ${c.status === 'Good Standing'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : c.status === 'Warning'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                        {c.status}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                        <span className="text-slate-500">Attendance Rate</span>
                        <span className="text-slate-900 font-black">{c.percentage}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-500 ${c.percentage >= 80 ? 'bg-emerald-600' : c.percentage >= 70 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                          style={{ width: `${Math.min(100, c.percentage)}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                      <div className="bg-slate-50 p-2 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Held</p>
                        <p className="text-sm font-black text-slate-800">{c.total_classes}</p>
                      </div>
                      <div className="bg-emerald-50/60 p-2 rounded-xl border border-emerald-100">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase">Attended</p>
                        <p className="text-sm font-black text-emerald-800">{c.attended_classes}</p>
                      </div>
                      <div className="bg-red-50/60 p-2 rounded-xl border border-red-100">
                        <p className="text-[10px] font-bold text-red-600 uppercase">Absent</p>
                        <p className="text-sm font-black text-red-800">{c.absent_classes}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Attendance History Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-emerald-600" /> Recent Attendance History
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">Detection logs</span>
                </div>

                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-bold tracking-wider border-b border-slate-200">
                      <th className="px-6 py-4">Course</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Check-In Time</th>
                      <th className="px-6 py-4">Duration Stayed</th>
                      <th className="px-6 py-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {attendanceLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          No recent attendance records found.
                        </td>
                      </tr>
                    ) : (
                      attendanceLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-emerald-700">{log.course || "--"}</td>
                          <td className="px-6 py-4 font-mono font-bold text-slate-900">{log.date}</td>
                          <td className="px-6 py-4 text-slate-600 font-medium">{log.check_in}</td>
                          <td className="px-6 py-4 text-slate-600 font-mono text-xs">{log.total_minutes} minutes</td>
                          <td className="px-6 py-4 text-right">
                            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${log.status === 'Present'
                              ? 'bg-emerald-100 text-emerald-800'
                              : log.status === 'Late'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                              }`}>
                              {log.status === 'Present' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                              {log.status === 'Late' && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                              {log.status === 'Absent' && <XCircle className="h-3.5 w-3.5 text-red-600" />}
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: ABSENCE NOTICE SUBMISSION */}
          {activeTab === 'absence_notice' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Form Column */}
              <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5 h-fit">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-600" /> Report Class Absence
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Inform your course faculty if you will be unable to attend a scheduled class.
                  </p>
                </div>

                <form onSubmit={handleNoticeSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Select Course</label>
                    <select
                      value={selectedCourse}
                      onChange={(e) => setSelectedCourse(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
                      required
                    >
                      {courseStats.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} - {c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Absence Date</label>
                    <input
                      type="date"
                      value={noticeDate}
                      onChange={(e) => setNoticeDate(e.target.value)}
                      className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Absence</label>
                    <textarea
                      rows={4}
                      value={noticeReason}
                      onChange={(e) => setNoticeReason(e.target.value)}
                      placeholder="Provide details (e.g. Medical illness, Family emergency, University event participation)..."
                      className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-xs shadow-sm transition-colors disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {isSubmitting ? 'Submitting...' : 'Submit Absence Notice'}
                  </button>
                </form>
              </div>

              {/* History Table Column */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Submitted Absence Notices</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    History of reported class absences and faculty status.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 text-xs font-bold tracking-wider border-b border-slate-200">
                        <th className="px-5 py-3.5">Course</th>
                        <th className="px-5 py-3.5">Absence Date</th>
                        <th className="px-5 py-3.5">Reason Given</th>
                        <th className="px-5 py-3.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {absenceNotices.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                            No absence notices submitted yet.
                          </td>
                        </tr>
                      ) : (
                        absenceNotices.map((n) => (
                          <tr key={n.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-5 py-3.5 font-mono font-bold text-emerald-700">{n.course}</td>
                            <td className="px-5 py-3.5 font-medium text-slate-900">{n.date}</td>
                            <td className="px-5 py-3.5 text-slate-600 max-w-xs truncate">{n.reason}</td>
                            <td className="px-5 py-3.5 text-right">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {n.status || 'Submitted'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FACE IMAGE CAPTURING & AI MODEL TRAINING */}
          {activeTab === 'face_registration' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {/* Left Column: Interactive Compact Camera Feed & Controls */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Camera className="h-5 w-5 text-emerald-600" /> Live Webcam Face Registration
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Real-time OpenCV Face Detection & Automatic Model Training.
                  </p>
                </div>

                {/* Compact Video Viewport (Slightly Smaller max-w-md Size) */}
                <div className="max-w-md mx-auto relative bg-slate-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center border-2 border-slate-800 shadow-md">
                  {/* Always keep video element mounted while camera active so regVideoRef is never null */}
                  <video
                    ref={regVideoRef}
                    className={`w-full h-full object-cover ${regStep === 'idle' ? 'hidden' : 'block'}`}
                    muted
                    autoPlay
                    playsInline
                  />

                  {/* OpenCV Processed Frame Overlay */}
                  {regProcessedFrameUrl && regStep === 'capturing' && (
                    <img src={regProcessedFrameUrl} alt="OpenCV Processed Frame" className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none" />
                  )}

                  {/* Offscreen Canvas for Socket encoding */}
                  <canvas ref={regCanvasRef} width={640} height={480} className="hidden" />

                  {/* Idle Overlay */}
                  {regStep === 'idle' && (
                    <div className="text-center p-6 space-y-3">
                      <div className="w-14 h-14 rounded-full bg-slate-800/80 text-emerald-400 flex items-center justify-center mx-auto border border-slate-700 shadow-lg">
                        <Camera className="h-7 w-7" />
                      </div>
                      <h4 className="text-sm font-bold text-white">Webcam Off</h4>
                      <p className="text-xs text-slate-400 max-w-xs">
                        Click <strong>"Start Camera & Register Face"</strong> below to open camera & capture 15 face samples.
                      </p>
                    </div>
                  )}

                  {/* Step Overlay Badges */}
                  {regStep === 'capturing' && (
                    <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-emerald-500/30 flex items-center gap-2 text-white text-xs font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                      <span>Scanning Face ({capturedCount}/15)</span>
                    </div>
                  )}

                  {regStep === 'training' && (
                    <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center text-white space-y-3 p-4 text-center">
                      <Sparkles className="h-8 w-8 text-emerald-400 animate-bounce" />
                      <div className="space-y-1">
                        <h4 className="text-sm font-black">Training AI Face Classifier</h4>
                        <p className="text-[11px] text-slate-300">Extracting facial landmarks & updating LBPH model...</p>
                      </div>
                    </div>
                  )}

                  {regStep === 'complete' && (
                    <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-md flex flex-col items-center justify-center text-white space-y-3 p-4 text-center">
                      <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
                        <Check className="h-7 w-7 stroke-[3]" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base font-black">Registration Successful!</h4>
                        <p className="text-[11px] text-emerald-200">15 samples captured & AI model trained.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress Bar & Status Text */}
                <div className="max-w-md mx-auto space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-600 font-mono truncate max-w-xs">{regStatusMsg}</span>
                    <span className="text-emerald-700 font-black">{Math.round((capturedCount / 15) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                    <div
                      className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${(capturedCount / 15) * 100}%` }}
                    ></div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  {regStep !== 'idle' && (
                    <button
                      type="button"
                      onClick={() => {
                        stopRegCamera();
                        setRegStep('idle');
                        setRegStatusMsg('Camera stopped.');
                      }}
                      className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
                    >
                      <CameraOff className="h-4 w-4" /> Stop Camera
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={startFaceRegistration}
                    disabled={regStep === 'capturing' || regStep === 'training'}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-colors"
                  >
                    <Camera className="h-4 w-4" />
                    {regStep === 'idle'
                      ? 'Start Camera & Register Face'
                      : regStep === 'capturing'
                        ? 'Capturing Samples...'
                        : regStep === 'training'
                          ? 'Training Model...'
                          : 'Retake / Re-register Face'}
                  </button>
                </div>
              </div>

              {/* Right Column: Instructions & Recognition Status Card (PLACED ON RIGHT SIDE) */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border shrink-0 ${studentInfo.is_face_registered
                      ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                      : 'bg-amber-100 border-amber-200 text-amber-700'
                      }`}>
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">Face Recognition Status</h3>
                      <p className="text-xs font-bold text-slate-500 mt-0.5 font-mono">
                        Student ID: {studentInfo.id}
                      </p>
                    </div>
                  </div>

                  <div className={`p-4 rounded-xl text-xs font-bold border space-y-1.5 ${studentInfo.is_face_registered
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                    <div className="flex items-center gap-2">
                      {studentInfo.is_face_registered ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      )}
                      <span>
                        {studentInfo.is_face_registered
                          ? 'AI Model Trained & Active'
                          : 'Face Samples Not Registered Yet'}
                      </span>
                    </div>
                    <p className="text-[11px] font-normal text-slate-600 leading-relaxed">
                      {studentInfo.is_face_registered
                        ? `Registered ${studentInfo.registered_samples_count || 15} image samples. Your face is trained for automatic detection in Teacher Portal.`
                        : 'Capture 15 face samples using your camera so the AI classifier can recognize you during class attendance.'}
                    </p>
                  </div>

                  <div className="pt-2 space-y-3 text-xs text-slate-600">
                    <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[10px]">
                      Capturing Instructions:
                    </h4>
                    <ul className="space-y-2.5 font-medium">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">•</span>
                        <span>Ensure your room is well-lit with clear visibility.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">•</span>
                        <span>Look directly into the camera while capturing.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">•</span>
                        <span>Slightly turn your head left/right for varied angles.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
