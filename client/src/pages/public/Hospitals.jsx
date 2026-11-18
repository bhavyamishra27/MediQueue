import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  MapPin,
  Phone,
  Search,
  Stethoscope,
  X,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';
import { Spinner } from '../../components/ui/Spinner';
import { catalogApi } from '../../lib/api';

export default function Hospitals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const city = searchParams.get('city') ?? '';
  const queryKey = searchParams.toString();

  const [searchInput, setSearchInput] = useState(search);
  const [cityInput, setCityInput] = useState(city);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setSearchInput(search);
    setCityInput(city);
  }, [search, city]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    catalogApi
      .hospitals({ search, city }, { signal: controller.signal })
      .then((data) => setHospitals(data.hospitals ?? []))
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
    if (cityInput.trim()) next.set('city', cityInput.trim());
    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchInput('');
    setCityInput('');
    setSearchParams({});
  };

  const hasFilters = Boolean(search || city);

  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
          <Building2 className="h-4 w-4" />
          Public directory
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Find a hospital
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Browse participating hospitals, compare specialisations and open a hospital
          to see its active doctors.
        </p>
      </header>

      <form
        onSubmit={applyFilters}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="hospital-search">Search</Label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="hospital-search"
                placeholder="Hospital name, area or description"
                className="pl-9"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="hospital-city">City</Label>
            <Input
              id="hospital-city"
              className="mt-1.5"
              placeholder="Any city"
              value={cityInput}
              onChange={(event) => setCityInput(event.target.value)}
            />
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
            ? 'Searching hospitals…'
            : `${hospitals.length} hospital${hospitals.length === 1 ? '' : 's'} found`}
        </p>
        {hasFilters && (
          <p className="text-xs text-slate-400">
            Filters: {[search && `“${search}”`, city && city].filter(Boolean).join(' · ')}
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
          <Spinner label="Loading hospitals" />
        </div>
      ) : hospitals.length === 0 && !error ? (
        <EmptyState
          icon={Building2}
          title="No hospitals match those filters"
          description="Try a different city or clear the search to see every participating hospital."
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {hospitals.map((hospital) => (
            <Link
              key={hospital.id}
              to={`/hospitals/${hospital.id}`}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900 group-hover:text-blue-700">
                    {hospital.name}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {hospital.address}, {hospital.city}
                    </span>
                  </p>
                </div>
                <Badge variant="blue">
                  {hospital.doctorCount} doctor{hospital.doctorCount === 1 ? '' : 's'}
                </Badge>
              </div>

              {hospital.description && (
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                  {hospital.description}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-1.5">
                {hospital.specializations.length > 0 ? (
                  hospital.specializations.map((specialization) => (
                    <Badge key={specialization} variant="default">
                      {specialization}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">
                    No active doctors listed yet
                  </span>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Phone className="h-3.5 w-3.5" />
                  {hospital.phone}
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-blue-600">
                  View hospital
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        <Stethoscope className="h-4 w-4 text-slate-400" />
        Looking for a specific doctor instead?{' '}
        <Link to="/doctors" className="font-medium text-blue-600 hover:text-blue-700">
          Browse the doctor directory
        </Link>
      </div>
    </div>
  );
}
