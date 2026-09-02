import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import gubLogo from '../../avatar/Logo.png';
import {
  ShieldCheck,
  Users,
  UserCheck,
  BookOpen,
  UserPlus,
  Plus,
  Trash2,
  CheckCircle,
  LogOut,
  RefreshCw,
  Search,
  GraduationCap,
  Eye,
  EyeOff
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'students' | 'faculty' | 'courses'>('students');
  const [adminInfo, setAdminInfo] = useState<{ name: string; email: string }>({ name: 'System Admin', email: 'admin@green.edu.bd' });
  const [students, setStudents] = useState<Array<any>>([]);
  const [faculty, setFaculty] = useState<Array<any>>([]);
  const [courses, setCourses] = useState<Array<any>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Student Form Modal State
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [studentForm, setStudentForm] = useState({ id: '', name: '', password: '', selectedCourses: [] as string[] });

  // Faculty Form Modal State
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [showFacultyPassword, setShowFacultyPassword] = useState(false);
  const [facultyForm, setFacultyForm] = useState({ name: '', email: '', password: '', role: 'user', selectedCourses: [] as string[] });

  // Course Form Modal State
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [courseForm, setCourseForm] = useState({ code: '', title: '' });

  const navigate = useNavigate();

  // Verify Admin Authentication & Fetch Data
  const fetchAdminData = async () => {
    setIsLoading(true);
    try {
      const stayRes = await axios.get(`${import.meta.env.VITE_API}/stay_signin`, { withCredentials: true });
      if (stayRes.data.msg !== 'success' || stayRes.data.role !== 'admin') {
        toast.error('Access denied. Admin credentials required.');
        navigate('/admin');
        return;
      }
      setAdminInfo({ name: stayRes.data.name || 'System Admin', email: stayRes.data.email || 'admin@green.edu.bd' });

      const [resStud, resFac, resCour] = await Promise.all([
        axios.get(`${import.meta.env.VITE_API}/admin/students`, { withCredentials: true }),
        axios.get(`${import.meta.env.VITE_API}/admin/faculty`, { withCredentials: true }),
        axios.get(`${import.meta.env.VITE_API}/admin/courses`, { withCredentials: true }),
      ]);

      setStudents(resStud.data || []);
      setFaculty(resFac.data || []);
      setCourses(resCour.data || []);
    } catch (err: any) {
      console.error('Admin data fetch error:', err);
      if (err.response?.status === 401) {
        navigate('/admin');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleSignOut = async () => {
    try {
      await axios.delete(`${import.meta.env.VITE_API}/signout`, { withCredentials: true });
    } catch (e) {
      // Ignore error on signout
    }
    navigate('/admin');
  };

  // Save Handlers
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.id || !studentForm.name) {
      toast.error('Student ID and Name are required');
      return;
    }
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API}/admin/students`,
        {
          id: studentForm.id,
          name: studentForm.name,
          password: studentForm.password,
          courses: studentForm.selectedCourses.join(', '),
        },
        { withCredentials: true }
      );
      if (res.data.msg === 'success') {
        toast.success('Student account & courses provisioned successfully!');
        setShowStudentModal(false);
        setStudentForm({ id: '', name: '', password: '', selectedCourses: [] });
        fetchAdminData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.msg || 'Failed to save student');
    }
  };

  const handleDeleteStudent = async (studentId: number) => {
    if (!window.confirm(`Are you sure you want to delete Student ID ${studentId}?`)) return;
    try {
      await axios.delete(`${import.meta.env.VITE_API}/admin/students/${studentId}`, { withCredentials: true });
      toast.success('Student deleted successfully');
      fetchAdminData();
    } catch (err) {
      toast.error('Failed to delete student');
    }
  };

  const handleSaveFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facultyForm.name || !facultyForm.email) {
      toast.error('Name and Email are required');
      return;
    }
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API}/admin/faculty`,
        {
          name: facultyForm.name,
          email: facultyForm.email,
          password: facultyForm.password,
          role: facultyForm.role,
          courses: facultyForm.selectedCourses.join(', '),
        },
        { withCredentials: true }
      );
      if (res.data.msg === 'success') {
        toast.success('Faculty account & courses provisioned successfully!');
        setShowFacultyModal(false);
        setFacultyForm({ name: '', email: '', password: '', role: 'user', selectedCourses: [] });
        fetchAdminData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.msg || 'Failed to save faculty');
    }
  };

  const handleDeleteFaculty = async (facultyId: number) => {
    if (!window.confirm('Are you sure you want to delete this faculty member?')) return;
    try {
      await axios.delete(`${import.meta.env.VITE_API}/admin/faculty/${facultyId}`, { withCredentials: true });
      toast.success('Faculty deleted successfully');
      fetchAdminData();
    } catch (err) {
      toast.error('Failed to delete faculty');
    }
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseForm.code || !courseForm.title) {
      toast.error('Course Code and Title are required');
      return;
    }
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API}/admin/courses`,
        { code: courseForm.code, title: courseForm.title },
        { withCredentials: true }
      );
      if (res.data.msg === 'success') {
        toast.success('Course created successfully!');
        setShowCourseModal(false);
        setCourseForm({ code: '', title: '' });
        fetchAdminData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.msg || 'Failed to create course');
    }
  };

  const handleDeleteCourse = async (courseId: number) => {
    if (!window.confirm('Are you sure you want to delete this course?')) return;
    try {
      await axios.delete(`${import.meta.env.VITE_API}/admin/courses/${courseId}`, { withCredentials: true });
      toast.success('Course deleted successfully');
      fetchAdminData();
    } catch (err) {
      toast.error('Failed to delete course');
    }
  };

  const toggleCourseSelection = (code: string, currentList: string[], setter: (val: string[]) => void) => {
    if (currentList.includes(code)) {
      setter(currentList.filter((c) => c !== code));
    } else {
      setter([...currentList, code]);
    }
  };

  // Filtered lists based on search query
  const filteredStudents = students.filter(
    (s) =>
      String(s.id).toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.courses || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFaculty = faculty.filter(
    (f) =>
      (f.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.courses || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCourses = courses.filter(
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
              Academic Management
            </p>
            <nav className="space-y-1.5">
              <button
                onClick={() => { setActiveTab('students'); setSearchQuery(''); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'students'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <GraduationCap className={`h-4.5 w-4.5 ${activeTab === 'students' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>Student Accounts</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  activeTab === 'students' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {students.length}
                </span>
              </button>

              <button
                onClick={() => { setActiveTab('faculty'); setSearchQuery(''); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'faculty'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <UserCheck className={`h-4.5 w-4.5 ${activeTab === 'faculty' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>Faculty / Teachers</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  activeTab === 'faculty' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {faculty.length}
                </span>
              </button>

              <button
                onClick={() => { setActiveTab('courses'); setSearchQuery(''); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'courses'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <BookOpen className={`h-4.5 w-4.5 ${activeTab === 'courses' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>Course Catalog</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  activeTab === 'courses' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {courses.length}
                </span>
              </button>
            </nav>
          </div>
        </div>

        {/* Bottom Administrator Profile & Logout */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 border border-emerald-200 shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="overflow-hidden min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">{adminInfo.name}</p>
              <p className="text-[10px] text-slate-500 font-mono truncate">{adminInfo.email}</p>
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
              {activeTab === 'students' && <>🎓 Student Accounts Provisioning</>}
              {activeTab === 'faculty' && <>👨‍🏫 Faculty / Teacher Accounts</>}
              {activeTab === 'courses' && <>📚 Academic Course Catalog</>}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Green University of Bangladesh - Administrative Portal
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Bar */}
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white focus:outline-none w-52 sm:w-64 transition-all"
              />
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchAdminData}
              className="p-2.5 bg-white hover:bg-emerald-50 text-emerald-700 rounded-xl transition-colors border border-slate-200 shadow-2xs"
              title="Refresh Data"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Light Green Action Buttons */}
            {activeTab === 'students' && (
              <button
                onClick={() => {
                  setStudentForm({ id: '', name: '', password: '', selectedCourses: [] });
                  setShowStudentPassword(false);
                  setShowStudentModal(true);
                }}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors"
              >
                <UserPlus className="h-4 w-4" /> Add & Provision Student
              </button>
            )}

            {activeTab === 'faculty' && (
              <button
                onClick={() => {
                  setFacultyForm({ name: '', email: '', password: '', role: 'user', selectedCourses: [] });
                  setShowFacultyPassword(false);
                  setShowFacultyModal(true);
                }}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors"
              >
                <UserPlus className="h-4 w-4" /> Add & Provision Faculty
              </button>
            )}

            {activeTab === 'courses' && (
              <button
                onClick={() => {
                  setCourseForm({ code: '', title: '' });
                  setShowCourseModal(true);
                }}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors"
              >
                <Plus className="h-4 w-4" /> Add New Course
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Content Table Area */}
        <div className="p-8 space-y-6 flex-1">
          {/* TAB 1: STUDENTS MANAGEMENT */}
          {activeTab === 'students' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Total Provisioned Students ({filteredStudents.length})
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-bold tracking-wider border-b border-slate-200">
                      <th className="px-6 py-4">Student ID</th>
                      <th className="px-6 py-4">Student Name</th>
                      <th className="px-6 py-4">Assigned Courses</th>
                      <th className="px-6 py-4">Password Status</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          {searchQuery ? (
                            <span>No students matching "<strong>{searchQuery}</strong>".</span>
                          ) : (
                            <span>No student accounts provisioned yet. Click <strong>"Add & Provision Student"</strong> above to create one.</span>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-emerald-700">{s.id}</td>
                          <td className="px-6 py-4 font-semibold text-slate-900">{s.name}</td>
                          <td className="px-6 py-4">
                            {s.courses ? (
                              <div className="flex flex-wrap gap-1.5">
                                {s.courses.split(',').map((c: string, idx: number) => (
                                  <span key={idx} className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {c.trim()}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">No courses assigned</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> Password Set
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              onClick={() => {
                                setStudentForm({
                                  id: String(s.id),
                                  name: s.name,
                                  password: '',
                                  selectedCourses: s.courses ? s.courses.split(',').map((c: string) => c.trim()).filter(Boolean) : [],
                                });
                                setShowStudentPassword(false);
                                setShowStudentModal(true);
                              }}
                              className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors border border-emerald-200"
                            >
                              Edit / Courses
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(s.id)}
                              className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-200"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: FACULTY MANAGEMENT */}
          {activeTab === 'faculty' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Faculty Members & Role Provisioning ({filteredFaculty.length})
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-bold tracking-wider border-b border-slate-200">
                      <th className="px-6 py-4">Faculty Name</th>
                      <th className="px-6 py-4">GUB Email</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Assigned Teaching Courses</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredFaculty.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          {searchQuery ? (
                            <span>No faculty members matching "<strong>{searchQuery}</strong>".</span>
                          ) : (
                            <span>No faculty accounts provisioned yet. Click <strong>"Add & Provision Faculty"</strong> above to create one.</span>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredFaculty.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-semibold text-slate-900">{f.name}</td>
                          <td className="px-6 py-4 text-slate-600 font-mono text-xs">{f.email}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              f.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {f.role === 'admin' ? 'Admin' : 'Faculty'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {f.courses ? (
                              <div className="flex flex-wrap gap-1.5">
                                {f.courses.split(',').map((c: string, idx: number) => (
                                  <span key={idx} className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {c.trim()}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">No teaching courses assigned</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              onClick={() => {
                                setFacultyForm({
                                  name: f.name,
                                  email: f.email,
                                  password: '',
                                  role: f.role || 'user',
                                  selectedCourses: f.courses ? f.courses.split(',').map((c: string) => c.trim()).filter(Boolean) : [],
                                });
                                setShowFacultyPassword(false);
                                setShowFacultyModal(true);
                              }}
                              className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors border border-emerald-200"
                            >
                              Edit / Courses
                            </button>
                            <button
                              onClick={() => handleDeleteFaculty(f.id)}
                              className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-200"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: COURSE CATALOG */}
          {activeTab === 'courses' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Active University Courses ({filteredCourses.length})
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs font-bold tracking-wider border-b border-slate-200">
                      <th className="px-6 py-4">Course Code</th>
                      <th className="px-6 py-4">Course Title</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredCourses.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                          {searchQuery ? (
                            <span>No courses matching "<strong>{searchQuery}</strong>".</span>
                          ) : (
                            <span>No courses created yet. Click <strong>"Add New Course"</strong> above to create one.</span>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredCourses.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-4 font-mono font-black text-emerald-700">{c.code}</td>
                          <td className="px-6 py-4 font-semibold text-slate-800">{c.title}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteCourse(c.id)}
                              className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-200"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Student Provisioning Modal with Eye Toggle */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-extrabold text-slate-900">Provision Student & Assign Courses</h3>
            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Student ID (Numeric)</label>
                <input
                  type="number"
                  value={studentForm.id}
                  onChange={(e) => setStudentForm({ ...studentForm, id: e.target.value })}
                  placeholder="e.g. 221902117"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Student Full Name</label>
                <input
                  type="text"
                  value={studentForm.name}
                  onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })}
                  placeholder="e.g. Abir Hasan"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password (Click Eye icon to reveal)</label>
                <div className="relative">
                  <input
                    type={showStudentPassword ? "text" : "password"}
                    value={studentForm.password}
                    onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })}
                    placeholder="Set password for student login"
                    className="w-full border border-slate-300 rounded-xl pl-3.5 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStudentPassword(!showStudentPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                    title={showStudentPassword ? "Hide password" : "Show password"}
                  >
                    {showStudentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Assign Multiple Courses</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 border border-slate-200 rounded-xl bg-slate-50">
                  {courses.map((c) => {
                    const isChecked = studentForm.selectedCourses.includes(c.code);
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer bg-white p-2 rounded-lg border border-slate-200 hover:border-emerald-500 transition-colors">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCourseSelection(c.code, studentForm.selectedCourses, (val) => setStudentForm({ ...studentForm, selectedCourses: val }))}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-bold">{c.code}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStudentModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Save & Provision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Faculty Provisioning Modal with Eye Toggle */}
      {showFacultyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-extrabold text-slate-900">Provision Faculty / Teacher & Assign Courses</h3>
            <form onSubmit={handleSaveFaculty} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Faculty Name</label>
                <input
                  type="text"
                  value={facultyForm.name}
                  onChange={(e) => setFacultyForm({ ...facultyForm, name: e.target.value })}
                  placeholder="e.g. Dr. Rahman"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">GUB Institutional Email</label>
                <input
                  type="email"
                  value={facultyForm.email}
                  onChange={(e) => setFacultyForm({ ...facultyForm, email: e.target.value })}
                  placeholder="faculty@green.edu.bd"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password (Click Eye icon to reveal)</label>
                <div className="relative">
                  <input
                    type={showFacultyPassword ? "text" : "password"}
                    value={facultyForm.password}
                    onChange={(e) => setFacultyForm({ ...facultyForm, password: e.target.value })}
                    placeholder="Set password for faculty login"
                    className="w-full border border-slate-300 rounded-xl pl-3.5 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFacultyPassword(!showFacultyPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                    title={showFacultyPassword ? "Hide password" : "Show password"}
                  >
                    {showFacultyPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Account Role</label>
                <select
                  value={facultyForm.role}
                  onChange={(e) => setFacultyForm({ ...facultyForm, role: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                >
                  <option value="user">Faculty / Teacher</option>
                  <option value="admin">University Administrator</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Assign Teaching Courses</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 border border-slate-200 rounded-xl bg-slate-50">
                  {courses.map((c) => {
                    const isChecked = facultyForm.selectedCourses.includes(c.code);
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer bg-white p-2 rounded-lg border border-slate-200 hover:border-emerald-500 transition-colors">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCourseSelection(c.code, facultyForm.selectedCourses, (val) => setFacultyForm({ ...facultyForm, selectedCourses: val }))}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-bold">{c.code}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFacultyModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Save & Provision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Course Modal */}
      {showCourseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <h3 className="text-lg font-extrabold text-slate-900">Add New Course Code</h3>
            <form onSubmit={handleSaveCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Course Code</label>
                <input
                  type="text"
                  value={courseForm.code}
                  onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })}
                  placeholder="e.g. CSE-101"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none uppercase font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Course Title</label>
                <input
                  type="text"
                  value={courseForm.title}
                  onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                  placeholder="e.g. Structured Programming"
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCourseModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Create Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
