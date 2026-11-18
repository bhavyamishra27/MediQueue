import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Mail,
  MapPin,
  Phone,
  Stethoscope,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { catalogApi } from '../../lib/api';
import { getInitials } from '../../lib/roles';

export default function HospitalDetail() {
  const { id } = useParams();
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setNotFound(false);

    catalogApi
      .hospital(id, { signal: controller.signal })
      .then((data) => setHospital(data.hospital))
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return;
        if (requestError.status === 404) setNotFound(true);
        else setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-20">
        <Spinner label="Loading hospital" />
      </div>
    );
  }

  if (notFound) {
    return (
      <EmptyState
        icon={Building2}
        title="Hospital not found"
        description="This hospital may have been removed, or the link is incorrect."
        action={
          <Link
            to="/hospitals"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to hospitals
          </Link>
        }
      />
    );
  }

  if (error || !hospital) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {error || 'The hospital could not be loaded.'}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link
        to="/hospitals"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        All hospitals
      </Link>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-white px-6 py-8 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                <Building2 className="h-3.5 w-3.5" />
                Hospital
              </span>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                {hospital.name}
              </h1>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400" />
                {hospital.address}, {hospital.city}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Active doctors
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {hospital.doctors.length}
              </p>
            </div>
          </div>

          {hospital.description && (
            <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-600">
              {hospital.description}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-4 w-4 text-slate-400" />
              {hospital.phone}
            </span>
            {hospital.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-slate-400" />
                {hospital.email}
              </span>
            )}
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Doctors at this hospital
            </h2>
            <Link
              to="/doctors"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Search all doctors
            </Link>
          </div>

          {hospital.doctors.length === 0 ? (
            <EmptyState
              className="mt-5"
              icon={Stethoscope}
              title="No active doctors listed"
              description="This hospital has not published any active doctor profiles yet."
            />
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {hospital.doctors.map((doctor) => (
                <Link
                  key={doctor.id}
                  to={`/doctors/${doctor.id}`}
                  className="group flex gap-4 rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/30"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-sm font-semibold text-teal-700 ring-1 ring-teal-200">
                    {getInitials(doctor.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 group-hover:text-blue-700">
                        {doctor.name}
                      </span>
                      <Badge variant="teal">{doctor.specialization}</Badge>
                    </span>
                    {doctor.qualification && (
                      <span className="mt-1 block text-sm text-slate-500">
                        {doctor.qualification}
                      </span>
                    )}
                    <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {doctor.experienceYears != null && (
                        <span>{doctor.experienceYears} years experience</span>
                      )}
                      <span>~{doctor.avgConsultationMinutes} min per patient</span>
                      {doctor.roomNumber && <span>Room {doctor.roomNumber}</span>}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
