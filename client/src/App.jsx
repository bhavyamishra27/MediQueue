import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { PublicLayout } from './components/layout/PublicLayout';
import { PageLoader } from './components/ui/Spinner';
import { useAuth } from './context/AuthContext';
import { getRoleHome } from './lib/roles';
import Landing from './pages/public/Landing';
import Login from './pages/public/Login';
import Register from './pages/public/Register';
import Hospitals from './pages/public/Hospitals';
import HospitalDetail from './pages/public/HospitalDetail';
import Doctors from './pages/public/Doctors';
import DoctorDetail from './pages/public/DoctorDetail';
import BookAppointment from './pages/patient/BookAppointment';
import PatientAppointments from './pages/patient/Appointments';
import PatientDashboard from './pages/patient/Dashboard';
import PatientQueue from './pages/patient/Queue';
import DoctorAppointments from './pages/doctor/Appointments';
import DoctorDashboard from './pages/doctor/Dashboard';
import Notifications from './pages/Notifications';
import HospitalDashboard from './pages/hospitalAdmin/Dashboard';
import HospitalAppointments from './pages/hospitalAdmin/Appointments';
import HospitalQueues from './pages/hospitalAdmin/Queues';
import HospitalDoctors from './pages/hospitalAdmin/Doctors';
import HospitalSchedules from './pages/hospitalAdmin/Schedules';
import HospitalProfile from './pages/hospitalAdmin/Profile';
import PlatformDashboard from './pages/platform/Dashboard';
import PlatformHospitals from './pages/platform/Hospitals';
import PlatformHospitalAdmins from './pages/platform/HospitalAdmins';
import Unauthorized from './pages/Unauthorized';
import NotFound from './pages/NotFound';

function RoleRedirect() {
  const { status, user } = useAuth();

  if (status === 'loading') {
    return <PageLoader label="Redirecting to your dashboard…" />;
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getRoleHome(user.role)} replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Public discovery directory */}
      <Route element={<PublicLayout />}>
        <Route path="/hospitals" element={<Hospitals />} />
        <Route path="/hospitals/:id" element={<HospitalDetail />} />
        <Route path="/doctors" element={<Doctors />} />
        <Route path="/doctors/:id" element={<DoctorDetail />} />
      </Route>

      {/* Authenticated + role-scoped application */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<RoleRedirect />} />

        <Route element={<AppShell />}>
          <Route path="/patient" element={<ProtectedRoute roles={['PATIENT']} />}>
            <Route index element={<PatientDashboard />} />
            <Route path="appointments" element={<PatientAppointments />} />
            <Route path="queue" element={<PatientQueue />} />
            <Route path="book/:doctorId" element={<BookAppointment />} />
          </Route>

          <Route path="/doctor" element={<ProtectedRoute roles={['DOCTOR']} />}>
            <Route index element={<DoctorDashboard />} />
            <Route path="appointments" element={<DoctorAppointments />} />
          </Route>

          <Route path="/notifications" element={<Notifications />} />

          <Route
            path="/hospital"
            element={<ProtectedRoute roles={['HOSPITAL_ADMIN']} />}
          >
            <Route index element={<HospitalDashboard />} />
            <Route path="doctors" element={<HospitalDoctors />} />
            <Route path="schedules" element={<HospitalSchedules />} />
            <Route path="appointments" element={<HospitalAppointments />} />
            <Route path="queues" element={<HospitalQueues />} />
            <Route path="profile" element={<HospitalProfile />} />
          </Route>

          <Route
            path="/platform"
            element={<ProtectedRoute roles={['PLATFORM_ADMIN']} />}
          >
            <Route index element={<PlatformDashboard />} />
            <Route path="hospitals" element={<PlatformHospitals />} />
            <Route path="hospital-admins" element={<PlatformHospitalAdmins />} />
          </Route>
        </Route>
      </Route>

      {/* Public status pages */}
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
