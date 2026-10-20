import { useQuery } from '@tanstack/react-query';
import { ErrorNote, Loading, PageHead, StatusChip } from '../components/ui';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import type { Role } from '../lib/types';

interface ActivityRow {
  id: string;
  entityType: string;
  action: string;
  summary: string;
  createdAt: string;
  user: { name: string; role: Role } | null;
}

export function ActivityPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['activity'], queryFn: () => api.get<ActivityRow[]>('/activity') });
  return (
    <>
      <PageHead title="Activity log" hint="Every important change: who did what, and when. Records are never silently deleted." />
      <ErrorNote error={error} />
      <section className="card">
        {isLoading ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Area</th>
                  <th>What happened</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((a) => (
                  <tr key={a.id}>
                    <td className="muted">{dateTime(a.createdAt)}</td>
                    <td>{a.user ? `${a.user.name}` : 'System'}</td>
                    <td>
                      <StatusChip status="DRAFT" text={a.entityType.toLowerCase()} />
                    </td>
                    <td style={{ whiteSpace: 'normal' }}>{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
