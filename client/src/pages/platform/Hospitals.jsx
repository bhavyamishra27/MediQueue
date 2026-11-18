import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  X,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { HospitalFormDialog } from '../../components/platform/HospitalFormDialog';
import { platformApi } from '../../lib/api';

export default function PlatformHospitals() {
  const [hospitals, setHospitals] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);

  const loadHospitals = async ({ quiet = false, signal } = {}) => {
    try {
      const data = await platformApi.hospitals({ search }, { signal });
      setHospitals(data.hospitals ?? []);
      setError('');
    } catch (requestError) {
      if (requestError?.name === 'AbortError') return;
      if (!quiet) setError(requestError.message);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        await loadHospitals({ signal: controller.signal });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadHospitals({ quiet: true });
    setRefreshing(false);
  };

  const handleSearch = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Hospitals</h1>
          <p className="mt-1 text-sm text-slate-600">
            Every hospital registered on this MediQueue installation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} loading={refreshing}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setRegisterOpen(true)}>
            <Plus className="h-4 w-4" />
            Register hospital
          </Button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by hospital name, city, address or email"
            className="pl-9 pr-9"
            aria-label="Search hospitals"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
        {search && (
          <Button type="button" variant="ghost" onClick={clearSearch}>
            Clear
          </Button>
        )}
      </form>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Hospital directory</CardTitle>
            <CardDescription>
              {search
                ? `Results for “${search}”.`
                : 'Administrators are scoped to exactly one hospital each.'}
            </CardDescription>
          </div>
          <Badge variant="blue">{hospitals.length} shown</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner label="Loading hospitals" />
            </div>
          ) : hospitals.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={search ? 'No hospitals match this search' : 'No hospitals registered'}
              description={
                search
                  ? 'Try a different name, city or email address.'
                  : 'Register the first hospital and create its administrator account.'
              }
              className="m-6 py-12"
              action={
                !search ? (
                  <Button onClick={() => setRegisterOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Register hospital
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Hospital</th>
                    <th className="px-4 py-2.5 font-semibold">Contact</th>
                    <th className="px-4 py-2.5 font-semibold">Doctors</th>
                    <th className="px-4 py-2.5 font-semibold">Administrator</th>
                    <th className="px-4 py-2.5 font-semibold">Registered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hospitals.map((hospital) => (
                    <tr key={hospital.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{hospital.name}</p>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          {hospital.address}, {hospital.city}
                        </p>
                        {hospital.description && (
                          <p className="mt-1 line-clamp-2 max-w-[18rem] text-xs text-slate-500">
                            {hospital.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <p className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3 text-slate-400" />
                          {hospital.phone}
                        </p>
                        {hospital.email && (
                          <p className="mt-0.5 inline-flex items-center gap-1">
                            <Mail className="h-3 w-3 text-slate-400" />
                            {hospital.email}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge variant="teal">
                          <Stethoscope className="h-3 w-3" />
                          {hospital.doctorCount}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {hospital.admin ? (
                          <>
                            <p className="inline-flex items-center gap-1 font-medium text-slate-800">
                              <ShieldCheck className="h-3 w-3 text-violet-500" />
                              {hospital.admin.name}
                            </p>
                            <p className="mt-0.5">{hospital.admin.email}</p>
                            {hospital.admin.phone && (
                              <p className="mt-0.5">{hospital.admin.phone}</p>
                            )}
                          </>
                        ) : (
                          <Badge variant="amber">Needs an administrator</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {new Date(hospital.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <HospitalFormDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSaved={() => loadHospitals({ quiet: true })}
      />
    </div>
  );
}
