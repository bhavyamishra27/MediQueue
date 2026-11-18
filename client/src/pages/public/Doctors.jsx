import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BriefcaseMedical,
  MapPin,
  Search,
  Stethoscope,
  X,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input, Select } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';
import { Spinner } from '../../components/ui/Spinner';
import { catalogApi } from '../../lib/api';
import { getInitials } from '../../lib/roles';

export default function Doctors() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const specialization = searchParams.get('specialization') ?? '';
  const hospitalId = searchParams.get('hospitalId') ?? '';
  const queryKey = searchParams.toString();

  const [searchInput, setSearchInput] = useState(search);
  const [specializationInput, setSpecializationInput] = useState(specialization);
  const [hospitalInput, setHospitalInput] = useState(hospitalId);
  const [doctors, setDoctors] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setSearchInput(search);
    setSpecializationInput(specialization);
    setHospitalInput(hospitalId);
  }, [search, specialization, hospitalId]);

  useEffect(() => {
    const controller = new AbortController();

    Promise.allSettled([
      catalogApi.hospitals({}, { signal: controller.signal }),
      catalogApi.specializations({ signal: controller.signal }),
    ]).then(([hospitalResult, specializationResult]) => {
      if (controller.signal.aborted) return;
      if (hospitalResult.status === 'fulfilled') {
        setHospitals(hospitalResult.value.hospitals ?? []);
      }
      if (specializationResult.status === 'fulfilled') {
        setSpecializations(specializationResult.value.specializations ?? []);
      }
    });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    catalogApi
      .doctors({ search, specialization, hospitalId }, { signal: controller.signal })
      .then((data) => setDoctors(data.doctors ?? []))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [queryKey]);

  const applyFilters = (event) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (searchInput.trim()) next.set('search', searchInput.trim());
    if (specializationInput) next.set('specialization', specializationInput);
    if (hospitalInput) next.set('hospitalId', hospitalInput);
    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSpecializationInput('');
    setHospitalInput('');
    setSearchParams({});
  };

  const hasFilters = Boolean(search || specialization || hospitalId);

  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <div className="flex items-center gap-2 text-sm font-medium text-teal-700">
          <Stethoscope className="h-4 w-4" />
          Public directory
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Find a doctor
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Search active doctors by name, specialisation or hospital. Open a profile to
          see qualifications and the weekly consultation schedule.
        </p>
      </header>

      <form
        onSubmit={applyFilters}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-end">
          <div>
            <Label htmlFor="doctor-search">Search</Label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="doctor-search"
                placeholder="Doctor name, specialisation or hospital"
                className="pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="doctor-specialization">Specialisation</Label>
            <Select
              id="doctor-specialization"
              className="mt-1.5"
              value={specializationInput}
              onChange={(event) => setSpecializationInput(event.target.value)}
            >
              <option value="">All specialisations</option>
              {specializations.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="doctor-hospital">Hospital</Label>
            <Select
              id="doctor-hospital"
              className="mt-1.5"
              value={hospitalInput}
              onChange={(event) => setHospitalInput(event.target.value)}
            >
              <option value="">All hospitals</option>
              {hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospital.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex gap-2">
            <Button type="submit">
              <Search className="h-4 w-4" />
              Search
            </Button>
            {hasFilters && (
              <Button type="button" variant="outline" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </form>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          {loading
            ? 'Searching doctors…'
            : `${doctors.length} doctor${doctors.length === 1 ? '' : 's'} found`}
        </p>
        {hasFilters && (
          <p className="text-xs text-slate-400">
            Filters:{' '}
            {[search && `“${search}”`, specialization, hospitalId && 'hospital']
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16">
          <Spinner label="Loading doctors" />
        </div>
      ) : doctors.length === 0 && !error ? (
        <EmptyState
          icon={Stethoscope}
          title="No doctors match those filters"
          description="Try a different specialisation or hospital, or clear the search to see every active doctor."
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {doctors.map((doctor) => (
            <Link
              key={doctor.id}
              to={`/doctors/${doctor.id}`}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-sm font-semibold text-teal-700 ring-1 ring-teal-200">
                  {getInitials(doctor.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold text-slate-900 group-hover:text-teal-700">
                    {doctor.name}
                  </h2>
                  <p className="mt-0.5 text-sm text-teal-700">{doctor.specialization}</p>
                  {doctor.qualification && (
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {doctor.qualification}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-600">
                {doctor.hospital && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">
                      {doctor.hospital.name} · {doctor.hospital.city}
                    </span>
                  </p>
                )}
                <p className="flex items-center gap-1.5">
                  <BriefcaseMedical className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {doctor.experienceYears != null
                    ? `${doctor.experienceYears} years experience`
                    : 'Experience not listed'}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge variant="blue">
                  ~{doctor.avgConsultationMinutes} min / patient
                </Badge>
                {doctor.roomNumber && (
                  <Badge variant="default">Room {doctor.roomNumber}</Badge>
                )}
              </div>

              <div className="mt-auto flex items-center justify-end gap-1 border-t border-slate-100 pt-4 text-sm font-medium text-teal-700">
                View profile
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
