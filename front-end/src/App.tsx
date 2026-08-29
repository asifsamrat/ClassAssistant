import React, { useState, useRef, useEffect } from "react";
import io from "socket.io-client";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import user from "./avatar/user.png";
import { useNavigate } from "react-router-dom";
// const socket = io("http://localhost:5000"); // Adjust if needed
const socket = io(import.meta.env.VITE_API, {
  transports: ["websocket"],
});

import {
  Calendar,
  Clock,
  Users,
  UserCheck,
  BarChart3,
  Settings,
  Search,
  Bell,
  Camera,
  UserPlus,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Sparkles,
} from "lucide-react";
import axios from "axios";
import ExamRoutine from "./components/ExamRoutine";

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalId = useRef<ReturnType<typeof setInterval> | any>(null);
  const [processedImage, setProcessedImage] = useState("");
  const [showSignOutPopup, setShowSignOutPopup] = useState(false);
  const [logInfo, setLogInfo] = useState({
    user: null,
    email: null,
  });
  const [dashboarddata, setDashboarddata] = useState<any>(null);
  const navigate = useNavigate();
  // if(activeTab=="attendance") console.log("hello")
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;
      setShowCamera(true); // Open modal or camera view

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current
            .play()
            .catch((err) => console.error("Play error:", err));

          intervalId.current = setInterval(() => {
            const canvas = canvasRef.current;
            const video = videoRef.current;
            if (canvas && video) {
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
                  0.6
                ); // 60% quality JPEG
              }
            }
          }, 400); // ~2.5 FPS
        }
      }, 300);

      // === Handle binary processed_frame from server ===
      socket.on("processed_frame", (buffer) => {
        const blob = new Blob([buffer], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        setProcessedImage(url); // Show in <img src={processedImage} />
      });
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  const stopCamera = async() => {
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    // datain={
    //     "student_name": logInfo.user,
    //     "is_present": setDashboarddata,
    //     "total_minutes": 20,
    //     "date": "25-09-2025"
    //   }
    
    const fetchData = async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API}/get_attendance`,
          {
            withCredentials: true,
          }
        );
        const data = response.data;
        console.log(`datas: ${data}`);

        const today = new Date().toISOString().split("T")[0];
        console.log(`neeeei`,today);
        const presentStudents = data
          .filter((student: any) =>
            student.date_time?.dates?.some(
              (entry: any) => entry.attendance_date === today
            )
          )
          .map((student: any) => ({
            id: student.id,
            name: student.name,
            department: "CSE",
            checkin: student.date_time.dates[0].ck_out,
            checkout: student.date_time.dates[0].ck_out,
            status: student.status,
          }));

        const presentIds = new Set(presentStudents.map((s: any) => s.id));

        const absentStudents = data
          .filter((student: any) => !presentIds.has(student.id))
          .map((student: any) => ({
            id: student.id,
            name: student.name,
            department: "CSE",
            checkin: "--",
            checkout: "--",
            status: "Absent",
          }));

          presentStudents.forEach((student: any) => {
            console.log(student.status==="on");
            let pr=false
            if(student.status==="on time")
            {
              pr=true;
            }
            axios.post("https://cmfz0qz5295wxjxgt1to5aoac.agent.a.smyth.ai/api/attendance", {
              student_name: student.name,
              is_present: pr,           
              total_minutes: 20,
              date: "2025-09-25"          
            })
          }
          )

        const finalAttendance = [...presentStudents, ...absentStudents];

        // setPresentToday(finalAttendance);
        console.log("Today's Attendance:", finalAttendance);
      } catch (error) {
        console.error(error);
      }
    };
    fetchData();
  };

  const [selectedDate, setSelectedDate] = useState(new Date());

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardContent activeTab={activeTab} />;
      case "attendance":
        return (
          <AttendanceContent
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            activeTab={activeTab}
          />
        );
      case "students":
        return <StudentsContent activeTab={activeTab} />;
      case "logs":
        return <TimeLogsContent activeTab={activeTab} />;
      case "exam_routine":
        return <ExamRoutine />;
      case "settings":
        return <SettingsContent activeTab={activeTab} />;
      default:
        return <DashboardContent activeTab={activeTab} />;
    }
  };
  useEffect(() => {
    (async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API}/stay_signin`,
          {
            withCredentials: true,
          }
        );
        console.log(response.data.msg);
        console.log(response.data.email);
        if (response.data.msg === "success") {
          setLogInfo({ user: response.data.name, email: response.data.email });
          console.log(logInfo);
        }
      } catch (error) {
        navigate("/");
        console.log(error);
      }
    })();
  }, []);
  const signouthandler = async () => {
    try {
      const response = await axios.delete(
        `${import.meta.env.VITE_API}/signout`,
        {
          withCredentials: true,
        }
      );

      if (response.data.msg === "success") {
        navigate("/");
      }
    } catch (error) {
      console.log(error);
      alert("signout failed");
    }
  };
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-8">
          <UserCheck className="h-8 w-8 text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-900">ClassAssistantAI</h1>
        </div>

        <nav className="space-y-1">
          {[
            { name: "Dashboard", icon: BarChart3, id: "dashboard" },
            { name: "Attendance", icon: Calendar, id: "attendance" },
            { name: "Students", icon: Users, id: "students" },
            { name: "Time Logs", icon: Clock, id: "logs" },
            { name: "Exam Routine", icon: BookOpen, id: "exam_routine" },
            { name: "Settings", icon: Settings, id: "settings" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.id
                  ? "bg-indigo-50 text-indigo-600"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </button>
          ))}
        </nav>

        {/* Start Camera Button */}
        <div className="mt-8 p-4 bg-indigo-50 rounded-lg">
          <h3 className="text-sm font-medium text-indigo-900 mb-3">
            Quick Check In/Out
          </h3>
          <button
            onClick={startCamera}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Camera className="h-5 w-5" />
            Start Camera
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search Students..."
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-gray-400 hover:text-gray-500">
              <Bell className="h-6 w-6" />
              <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
            </button>

            <img
              src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e"
              alt="Profile"
              className="h-10 w-10 rounded-full border-2 border-white shadow-sm"
              onClick={() => setShowSignOutPopup((prev) => !prev)}
            />
          </div>

          {showSignOutPopup && (
            <div className="absolute right-0 top-16 bg-white shadow-lg rounded-lg w-48 z-50 border">
              <div className="flex flex-col items-center justify-center py-4">
                <img
                  src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e"
                  alt="Profile"
                  className="h-10 w-10 rounded-full border-2 border-white shadow-sm"
                />
                <h1 className="text-center mt-2">{logInfo.user}</h1>
              </div>

              <div className="flex">
                <button
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-700"
                  onClick={() => signouthandler()}
                >
                  Sign Out
                </button>
                <button
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-700"
                  onClick={() => setShowSignOutPopup((prev) => !prev)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </header>

        {/* Camera Modal */}
        {showCamera && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  Face Recognition Check In/Out
                </h2>
                <button
                  onClick={stopCamera}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              {/* <div className="flex justify-center">
                <video
                  ref={videoRef}
                  width="400"
                  height="300"
                  muted
                  autoPlay
                  playsInline
                  className="border border-indigo-500 rounded-lg"
                />
                {/* Hidden Canvas */}
              {/* <canvas
                  ref={canvasRef}
                  width="320"
                  height="240"
                  style={{ display: "none" }}
                />
                {processedImage && (
                  <div>
                    <h3>Server Processed Image:</h3>
                    <img
                      src={processedImage}
                      alt="Processed"
                      width="400"
                      height="300"
                      style={{ border: "1px solid green" }}
                    />
                  </div>
                )}
              </div> } */}
              {/* new code  */}
              <div className="flex justify-center gap-4">
                <div className="w-[400px] h-[300px] border border-indigo-500 rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    muted
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
                <canvas
                  ref={canvasRef}
                  width="420"
                  height="340"
                  style={{ display: "none" }}
                />
                {processedImage && (
                  <div className="w-[400px] h-[300px] border border-green-500 rounded-lg overflow-hidden">
                    <img
                      src={processedImage}
                      alt="Processed"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
              {/*  */}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={stopCamera}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="p-8">{renderContent()}</div>
      </main>
    </div>
  );
}

function DashboardContent({ activeTab }: { activeTab: string }) {
  console.log(activeTab);
  const [dashboarddata, setDashboarddata] = useState<any>(null);
  const [totalstudent, setTotalstudent] = useState<number>(0);
  const [presentToday, setPresentToday] = useState<Array<any>>([]);
  const navigate = useNavigate();
  useEffect(() => {
    if (activeTab === "dashboard") {
      navigate(`/attendance-system/dashboard`);
      const fetchData = async () => {
        try {
          const response = await axios.get(
            `${import.meta.env.VITE_API}/dashboard`,
            {
              withCredentials: true,
            }
          );
          const data = response.data;

          setDashboarddata(data);
          setTotalstudent(data.length);

          // Filter for today's attendance using local YYYY-MM-DD format
          const d = new Date();
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const filtered = data
            .filter((student: any) =>
              student.date_time?.dates?.some(
                (entry: any) => entry.attendance_date === today
              )
            )
            .map((student: any) => {
              const todayEntries = student.date_time?.dates?.filter(
                (entry: any) => entry.attendance_date === today
              );
              const lastEntry = (todayEntries && todayEntries.length > 0)
                ? todayEntries[todayEntries.length - 1]
                : (student.date_time?.dates?.[student.date_time.dates.length - 1] || null);
              return {
                id: student.id,
                name: student.name,
                time: lastEntry ? (lastEntry.time || lastEntry.ck_time || "--") : "--",
                status: "Checked In",
              };
            });

          setPresentToday(filtered);
          console.log("Present today:", filtered);
        } catch (error) {
          console.error(error);
        }
      };

      fetchData();
    }
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {[
          {
            title: "Total Students",
            value: totalstudent,
            icon: Users,
            color: "bg-blue-500",
          },
          {
            title: "Present Today",
            value: presentToday.length,
            icon: UserCheck,
            color: "bg-green-500",
          },
          // { title: 'On Leave', value: '14', icon: Calendar, color: 'bg-orange-500' },
        ].map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  {stat.title}
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stat.value}
                </p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Activity
            </h2>
            <button className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
              View All
            </button>
          </div>
          <div className="space-y-4">
            {
              // [
              //   { name: "Sarah Wilson", time: "9:00 AM", status: "Checked In" },
              //   { name: "Michael Chen", time: "9:05 AM", status: "Checked In" },
              //   { name: "Emma Thompson", time: "9:15 AM", status: "Checked In" },
              //   {
              //     name: "James Rodriguez",
              //     time: "9:30 AM",
              //     status: "Checked In",
              //   },
              // ]

              presentToday.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                      {activity.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {activity.name}
                      </p>
                      <p className="text-xs text-gray-500">{activity.time}</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-full">
                    {activity.status}
                  </span>
                </div>
              ))
            }
          </div>
        </div>

        {/* Attendance Overview */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Attendance Overview
            </h2>
            <select className="text-sm border-gray-200 rounded-lg">
              <option>This Week</option>
              <option>This Month</option>
              <option>Last Month</option>
            </select>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">On Time</p>
                <p className="text-2xl font-bold text-gray-900">91%</p>
              </div>
              <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="w-[91%] h-full bg-green-500"></div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Late</p>
                <p className="text-2xl font-bold text-gray-900">6%</p>
              </div>
              <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="w-[6%] h-full bg-orange-500"></div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Absent</p>
                <p className="text-2xl font-bold text-gray-900">3%</p>
              </div>
              <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="w-[3%] h-full bg-red-500"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttendanceContent({
  selectedDate,
  setSelectedDate,
  activeTab,
}: {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  activeTab: string;
}) {
  console.log(activeTab);

  const [presentToday, setPresentToday] = useState<Array<any>>([]);
  const navigate = useNavigate();
  useEffect(() => {
    if (activeTab === "attendance") {
      navigate(`/attendance-system/attendance`);
      const fetchData = async () => {
        try {
          const response = await axios.get(
            `${import.meta.env.VITE_API}/get_attendance`,
            {
              withCredentials: true,
            }
          );
          const data = response.data;
          console.log(`datas: ${data}`);

          const d = new Date();
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          console.log(`neeeei`, today);
          const presentStudents = data
            .filter((student: any) =>
              student.date_time?.dates?.some(
                (entry: any) => entry.attendance_date === today
              )
            )
            .map((student: any) => {
              const todayEntry = student.date_time?.dates?.find(
                (entry: any) => entry.attendance_date === today
              );
              return {
                id: student.id,
                name: student.name,
                department: "CSE",
                checkin: todayEntry?.ck_time ?? todayEntry?.time ?? "--",
                checkout: todayEntry?.ck_out ?? todayEntry?.time ?? "--",
                status: student.status || "Present",
              };
            });

          const presentIds = new Set(presentStudents.map((s: any) => s.id));

          const absentStudents = data
            .filter((student: any) => !presentIds.has(student.id))
            .map((student: any) => ({
              id: student.id,
              name: student.name,
              department: "CSE",
              checkin: "--",
              checkout: "--",
              status: "Absent",
            }));

          const finalAttendance = [...presentStudents, ...absentStudents];

          setPresentToday(finalAttendance);
          console.log("Today's Attendance:", finalAttendance);
        } catch (error) {
          console.error(error);
        }
      };

      fetchData();
    }
  }, [activeTab]);

  // genarate pdf
  const generatePDF = () => {
    console.log("hello");
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Student Attendance Report", 14, 22);
    doc.setFontSize(11);

    const headers = [
      ["STUDENT", "DEPARTMENT", "CHECK IN", "CHECK OUT", "STATUS"],
    ];

    const rows = presentToday.map((std: any) => [
      std.name,
      std.department,
      std.checkin,
      std.checkout,
      std.status,
    ]);

    (doc as any).autoTable({
      startY: 30,
      head: headers,
      body: rows,
      theme: "striped",
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [80, 80, 80],
        fontStyle: "bold",
      },
      bodyStyles: {
        valign: "middle",
      },
      styles: {
        cellPadding: 4,
        fontSize: 10,
        overflow: "linebreak",
      },
      didParseCell: function (data: any) {
        if (data.column.index === 4 && data.cell.text[0] === "Present") {
          data.cell.styles.fillColor = [212, 237, 218]; // light green
          data.cell.styles.textColor = [40, 167, 69]; // green
        } else if (data.column.index === 4 && data.cell.text[0] === "Absent") {
          data.cell.styles.fillColor = [248, 215, 218]; // light red
          data.cell.styles.textColor = [220, 53, 69]; // red
        }
      },
    });

    doc.save("students-attendance.pdf");
  };
  async function filterByDate() {
    const dateObject = new Date(selectedDate);
  
    // Adjust the date back one day
    dateObject.setDate(dateObject.getDate());
    
    // Format the adjusted date to YYYY-MM-DD
    const year = dateObject.getFullYear();
    const month = String(dateObject.getMonth() + 1).padStart(2, "0");
    const day = String(dateObject.getDate()).padStart(2, "0");
  
    const formattedDate = `${year}-${month}-${day}`;
    console.log(`The formatted date is: ${formattedDate}`);
    const datainfo = {
      date: formattedDate
    };
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API}/filter_by_date`,
        datainfo,
        {
          withCredentials: true,
        }
      );
      const data = response.data;
      console.log("datas:", data);
  
      const today = formattedDate;
  
      const presentStudents = data
        .map((student: any) => {
          // find the matching date entry for today
          const todayEntry = student.date_time?.dates?.find(
            (entry: any) => entry.attendance_date === today
          );
  
          if (!todayEntry) return null;
  
          return {
            id: student.id,
            name: student.name,
            department: "CSE",
            checkin: todayEntry.ck_time ?? "--",
            checkout: todayEntry.ck_out ?? "--",
            status: student.status ?? "Present",
          };
        })
        .filter(Boolean); // remove nulls
  
      const presentIds = new Set(presentStudents.map((s: any) => s.id));
  
      const absentStudents = data
        .filter((student: any) => !presentIds.has(student.id))
        .map((student: any) => ({
          id: student.id,
          name: student.name,
          department: "CSE",
          checkin: "--",
          checkout: "--",
          status: "Absent",
        }));
  
      const finalAttendance = [...presentStudents, ...absentStudents];
  
      setPresentToday(finalAttendance);
      console.log("Today's Attendance:", finalAttendance);
    } catch (error: any) {
      console.error(
        "Axios Error:",
        error.response ? error.response.data : error.message
      );
    }
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Attendance</h2>
          <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-2">
            <button
              onClick={() => {
                setSelectedDate(
                  new Date(selectedDate.setDate(selectedDate.getDate() -1))
                );
                filterByDate();
              }}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium px-2">
              {selectedDate.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <button
              onClick={() =>{
                setSelectedDate(
                  new Date(selectedDate.setDate(selectedDate.getDate() + 1))
                );
                filterByDate();
              }
              }
              className="p-1 hover:bg-gray-100 rounded"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            <Filter className="h-5 w-5" />
            Filter
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            onClick={generatePDF}
          >
            <Download className="h-5 w-5" />
            Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Student
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Check In
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Check Out
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {
                // [
                //   {
                //     name: "Sarah Wilson",
                //     department: "CSE",
                //     checkIn: "9:00 AM",
                //     checkOut: "5:00 PM",
                //     status: "Present",
                //   },
                //   {
                //     name: "Michael Chen",
                //     department: "CSE",
                //     checkIn: "9:05 AM",
                //     checkOut: "5:15 PM",
                //     status: "Present",
                //   },
                //   {
                //     name: "Emma Thompson",
                //     department: "CSE",
                //     checkIn: "9:15 AM",
                //     checkOut: "5:30 PM",
                //     status: "Present",
                //   },
                //   {
                //     name: "James Rodriguez",
                //     department: "CSE",
                //     checkIn: "9:30 AM",
                //     checkOut: "5:45 PM",
                //     status: "Present",
                //   },
                // ]
                presentToday.map((student, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                          {student.name.charAt(0)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {student.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {student.department}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {student.checkin}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {student.checkout}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 text-xs font-medium ${
                          student.status == "Present"
                            ? "text-green-700"
                            : "text-red-700"
                        }  bg-green-50 rounded-full`}
                      >
                        {student.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button className="text-indigo-600 hover:text-indigo-900">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StudentsContent({ activeTab }: { activeTab: string }) {
  const [profile, setProfile] = useState<Array<any>>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [regStep, setRegStep] = useState<"input" | "capturing" | "training" | "complete">("input");
  const [capturedCount, setCapturedCount] = useState(0);
  const [regStudentId, setRegStudentId] = useState<number | null>(null);
  const [regProcessedImage, setRegProcessedImage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const regVideoRef = useRef<HTMLVideoElement>(null);
  const regCanvasRef = useRef<HTMLCanvasElement>(null);
  const regStreamRef = useRef<MediaStream | null>(null);
  const regIntervalId = useRef<NodeJS.Timeout | null>(null);

  const navigate = useNavigate();

  const fetchProfiles = async () => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API}/profiles`,
        { withCredentials: true }
      );
      setProfile(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (activeTab == "students") {
      navigate(`/attendance-system/students`);
      fetchProfiles();
    }
  }, [activeTab]);

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

  useEffect(() => {
    const handleProgress = (data: any) => {
      if (data && data.captured_count !== undefined) {
        setCapturedCount(data.captured_count);
        if (data.status === "training") {
          setRegStep("training");
          setStatusMessage("Capturing complete! Training AI Classifier Model...");
        } else {
          setStatusMessage(`Captured ${data.captured_count} / 15 face samples`);
        }
      }
    };

    const handleProcessedFrame = (buffer: ArrayBuffer) => {
      const blob = new Blob([buffer], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      setRegProcessedImage(url);
    };

    const handleComplete = (data: any) => {
      setRegStep("complete");
      setStatusMessage(data.message || "Student registered and AI model trained successfully!");
      toast.success("Student registered and trained successfully!");
      stopRegCamera();
      fetchProfiles();
    };

    socket.on("register_progress", handleProgress);
    socket.on("register_processed_frame", handleProcessedFrame);
    socket.on("register_complete", handleComplete);

    return () => {
      socket.off("register_progress", handleProgress);
      socket.off("register_processed_frame", handleProcessedFrame);
      socket.off("register_complete", handleComplete);
    };
  }, []);

  const handleCloseModal = () => {
    stopRegCamera();
    setShowAddModal(false);
    setRegStep("input");
    setStudentName("");
    setCapturedCount(0);
    setRegStudentId(null);
    setRegProcessedImage("");
    setStatusMessage("");
  };

  const handleStartRegister = async () => {
    if (!studentName.trim()) {
      toast.error("Please enter a student name");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API}/register_student`,
        { name: studentName.trim() },
        { withCredentials: true }
      );

      const createdStudentId = res.data.id;
      setRegStudentId(createdStudentId);
      setRegStep("capturing");
      setStatusMessage("Starting camera... Please look at the camera");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      regStreamRef.current = stream;

      setTimeout(() => {
        if (regVideoRef.current) {
          regVideoRef.current.srcObject = stream;
          regVideoRef.current.play().catch((err) => console.error("Play error:", err));

          regIntervalId.current = setInterval(() => {
            const canvas = regCanvasRef.current;
            const video = regVideoRef.current;
            if (canvas && video) {
              const context = canvas.getContext("2d");
              if (context) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(
                  (blob) => {
                    if (blob) {
                      blob.arrayBuffer().then((buffer) => {
                        socket.emit("register_capture_frame", {
                          student_id: createdStudentId,
                          frame: new Uint8Array(buffer),
                        });
                      });
                    }
                  },
                  "image/jpeg",
                  0.7
                );
              }
            }
          }, 350);
        }
      }, 300);

    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.error || "Failed to register student");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Students</h2>
        <button
          onClick={() => {
            setShowAddModal(true);
            setRegStep("input");
            setStudentName("");
            setCapturedCount(0);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
        >
          <UserPlus className="h-5 w-5" />
          Add Student
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {profile.map((profiles, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-4">
              <img
                src={user}
                alt={profiles.name}
                className="h-16 w-16 rounded-full object-cover"
              />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {profiles.name}
                </h3>
                <p className="text-sm text-gray-500">
                  {profiles.description}
                </p>
                <p className="text-sm text-gray-500">{profiles.department}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 px-4 py-2 text-sm text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 font-medium">
                View Profile
              </button>
              <button className="flex-1 px-4 py-2 text-sm text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 font-medium">
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Student & Face Capture Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Register New Student & Train AI
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {regStep === "input" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Student Full Name
                  </label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Enter student full name"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg text-sm text-indigo-800 space-y-1">
                  <p className="font-semibold text-indigo-900">Registration Process:</p>
                  <p>• Step 1: Enter student name and click "Start Face Capture".</p>
                  <p>• Step 2: Position student in front of camera to capture 15 face samples.</p>
                  <p>• Step 3: The AI model will automatically train on the captured samples.</p>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={handleCloseModal}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStartRegister}
                    disabled={isSubmitting || !studentName.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
                  >
                    {isSubmitting ? "Starting..." : "Start Face Capture"}
                  </button>
                </div>
              </div>
            )}

            {(regStep === "capturing" || regStep === "training") && (
              <div className="space-y-4 text-center">
                <div className="flex justify-center gap-4">
                  <div className="w-[300px] h-[220px] border-2 border-indigo-500 rounded-lg overflow-hidden relative bg-black">
                    <video
                      ref={regVideoRef}
                      muted
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <canvas
                      ref={regCanvasRef}
                      width="300"
                      height="220"
                      className="hidden"
                    />
                  </div>
                  {regProcessedImage && (
                    <div className="w-[300px] h-[220px] border-2 border-green-500 rounded-lg overflow-hidden bg-black">
                      <img
                        src={regProcessedImage}
                        alt="Face Detection"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-800">
                    {statusMessage}
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        regStep === "training" ? "bg-indigo-600 animate-pulse" : "bg-green-500"
                      }`}
                      style={{
                        width: regStep === "training" ? "100%" : `${(capturedCount / 15) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleCloseModal}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {regStep === "complete" && (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
                  ✓
                </div>
                <h4 className="text-xl font-bold text-gray-900">
                  Registration & AI Training Complete!
                </h4>
                <p className="text-sm text-gray-600">
                  Student <span className="font-semibold text-gray-900">{studentName}</span> face data has been captured and the classifier model trained.
                </p>
                <div className="pt-4">
                  <button
                    onClick={handleCloseModal}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TimeLogsContent({ activeTab }: { activeTab: string }) {
  const [timeslogs, setTimeslogs] = useState<Array<any>>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (activeTab == "logs") navigate(`/attendance-system/logs`);
    (async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API}/time_logs`,
          {
            withCredentials: true,
          }
        );
        console.log(response.data);
        const filtered = response.data
          .filter((item: any) => item.date_time?.dates?.[0]?.attendance_date && item.date_time?.dates?.[0]?.attendance_date !== "--")
          .map((item: any) => ({
            date: item.date_time?.dates?.[0]?.attendance_date || "--",
            name: item.name,
            checkin: item.date_time?.dates?.[0]?.ck_time || "--",
            status: item.status,
            checkout: item.date_time?.dates?.[0]?.ck_out || "--",
            totalhours: item.date_time?.dates?.[0]?.total_time || 0,
          }));
        setTimeslogs(filtered);
        console.log(filtered);
      } catch (error) {
        console.log(error);
      }
    })();
  }, []);

  // genarate pdf
  const generatePDF = () => {
    console.log("hello");
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Student Times Log Report", 14, 22);
    doc.setFontSize(11);

    const headers = [
      ["DATE", "STUDENT", "CHECK IN", "CHECK OUT", "TOTAL MINUETS", "STATUS"],
    ];

    const rows = timeslogs.map((std: any) => [
      std.date,
      std.name,
      std.checkin,
      std.checkout,
      std.totalhours,
      std.status,
    ]);

    (doc as any).autoTable({
      startY: 30,
      head: headers,
      body: rows,
      theme: "striped",
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [80, 80, 80],
        fontStyle: "bold",
      },
      bodyStyles: {
        valign: "middle",
      },
      styles: {
        cellPadding: 4,
        fontSize: 10,
        overflow: "linebreak",
      },
      didParseCell: function (data: any) {
        if (data.column.index === 4 && data.cell.text[0] === "on time") {
          data.cell.styles.fillColor = [212, 237, 218]; // light green
          data.cell.styles.textColor = [40, 167, 69]; // green
        } else if (data.column.index === 4 && data.cell.text[0] === "late") {
          data.cell.styles.fillColor = [248, 215, 218]; // light red
          data.cell.styles.textColor = [220, 53, 69]; // red
        }
      },
    });

    doc.save("students-times_log.pdf");
  };
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Time Logs</h2>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            <Filter className="h-5 w-5" />
            Filter
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            onClick={generatePDF}
          >
            <Download className="h-5 w-5" />
            Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex gap-4">
            <select className="text-sm border-gray-200 rounded-lg">
              <option>All Departments</option>
              <option>Engineering</option>
              <option>Design</option>
              <option>Marketing</option>
              <option>Sales</option>
            </select>
            <select className="text-sm border-gray-200 rounded-lg">
              <option>This Week</option>
              <option>This Month</option>
              <option>Last Month</option>
              <option>Custom Range</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  STUDENT
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Check In
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Check Out
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total MINUTES
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {
                // [
                //   {
                //     date: "2025-03-20",
                //     name: "Sarah Wilson",
                //     checkIn: "9:00 AM",
                //     checkOut: "5:00 PM",
                //     hours: "8h 00m",
                //     status: "On Time",
                //   },
                //   {
                //     date: "2025-03-20",
                //     name: "Michael Chen",
                //     checkIn: "9:05 AM",
                //     checkOut: "5:15 PM",
                //     hours: "8h 10m",
                //     status: "On Time",
                //   },
                //   {
                //     date: "2025-03-20",
                //     name: "Emma Thompson",
                //     checkIn: "9:15 AM",
                //     checkOut: "5:30 PM",
                //     hours: "8h 15m",
                //     status: "Late",
                //   },
                //   {
                //     date: "2025-03-20",
                //     name: "James Rodriguez",
                //     checkIn: "9:30 AM",
                //     checkOut: "5:45 PM",
                //     hours: "8h 15m",
                //     status: "Late",
                //   },
                // ]
                timeslogs.map((log, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                          {log.name.charAt(0)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {log.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.checkin}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.checkout}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.totalhours}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 text-xs font-medium rounded-full ${
                          log.status === "on time"
                            ? "text-green-700 bg-green-50"
                            : "text-orange-700 bg-orange-50"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SettingsContent({ activeTab }: { activeTab: string }) {
  const [starttime, setStartime] = useState<string>("");
  const [endtime, setEndtime] = useState<string>("");
  const [lateCount, setLetcount] = useState<number>();
  const navigate = useNavigate();
  const showToastMessage = () => {
    toast.success("Setting Updated !", {
      position: "top-right",
    });
  };
  function convertTo12Hour(time24: string): string {
    const [hourStr, minute] = time24.split(":");
    let hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12; // convert "0" to "12"
    let second = "00";
    return `${hour}:${minute}:${second} ${ampm}`;
  }
  const handleSettings = async () => {
    const str = convertTo12Hour(starttime);
    const endt = convertTo12Hour(endtime);

    const settings = {
      id: 1,
      start_time: str,
      end_time: endt,
      late_count: lateCount,
    };
    console.log(settings);
    try {
      const response = await axios.put(
        `${import.meta.env.VITE_API}/settings`,
        settings,
        {
          withCredentials: true,
        }
      );
      console.log(response);
      showToastMessage();
      // alert("success")
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    if (activeTab == "settings") navigate(`/attendance-system/settings`);
    (async () => {
      try {
        let response = await axios.get(`${import.meta.env.VITE_API}/settings`, {
          withCredentials: true,
        });
        let setting = response.data;
        setStartime(setting.start);
        setEndtime(setting.end);
        setLetcount(setting.late);
        console.log(response);
        console.log(typeof starttime);
      } catch (error) {
        console.log(error);
      }
    })();
  }, []);
  return (
    <div className="space-y-6">
      <ToastContainer />
      <h2 className="text-2xl font-bold text-gray-900">Settings</h2>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            General Settings
          </h3>
          <p className="text-sm text-gray-500">
            Configure your attendance system settings
          </p>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">
              Class Hours
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  defaultValue={starttime}
                  className="w-full border-gray-200 rounded-lg"
                  onChange={(e) => setStartime(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  defaultValue={endtime}
                  className="w-full border-gray-200 rounded-lg"
                  onChange={(e) => setEndtime(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">
              Attendance Rules
            </h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Threshold time
                  </p>
                  <p className="text-xs text-gray-500">
                    Allow late check-in up to specified minutes
                  </p>
                </div>
                <input
                  type="number"
                  defaultValue={lateCount}
                  min="0"
                  max="60"
                  className="w-20 border-gray-200 rounded-lg"
                  onChange={(e) => setLetcount(parseInt(e.target.value))}
                />
              </div>
              {/* <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Overtime Threshold
                  </p>
                  <p className="text-xs text-gray-500">
                    Minutes after work hours to count as overtime
                  </p>
                </div>
                <input
                  type="number"
                  defaultValue="30"
                  min="0"
                  className="w-20 border-gray-200 rounded-lg"
                />
              </div> */}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">
              Face Recognition Settings
            </h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Confidence Threshold
                  </p>
                  <p className="text-xs text-gray-500">
                    Minimum confidence score for face recognition
                  </p>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  defaultValue="90"
                  className="w-32"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Multiple Face Detection
                  </p>
                  <p className="text-xs text-gray-500">
                    Allow multiple faces in the frame
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer- focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-4">
              Notifications
            </h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Email Notifications
                  </p>
                  <p className="text-xs text-gray-500">
                    Send email notifications for attendance events
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6 bg-gray-50 border-t border-gray-200">
          <div className="flex justify-end gap-3">
            <button className="px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              onClick={handleSettings}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
