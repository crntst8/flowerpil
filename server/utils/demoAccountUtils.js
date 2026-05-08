import { getQueries } from '../database/db.js';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

export const isAdminViewer = (user) => Boolean(user && ADMIN_ROLES.has(user.role));

export const getDemoCuratorIdSet = () => {
  const queries = getQueries();
  const rows = queries.getDemoCurators.all() || [];
  return new Set(rows.map((row) => row.id));
};

export const canViewDemoCurator = (user, curatorId) => {
  if (!user || !curatorId) return false;
  if (isAdminViewer(user)) return true;
  return user.role === 'curator' && Number(user.curator_id) === Number(curatorId);
};

export const filterDemoCurators = (curators = [], demoCuratorIds, user) => {
  if (!demoCuratorIds || demoCuratorIds.size === 0) return curators;
  if (isAdminViewer(user)) return curators;

  const allowedCuratorId = user?.role === 'curator' ? Number(user.curator_id) : null;
  return curators.filter((curator) => {
    if (!demoCuratorIds.has(curator.id)) return true;
    return allowedCuratorId && Number(curator.id) === allowedCuratorId;
  });
};

export const filterDemoPlaylists = (playlists = [], demoCuratorIds, user) => {
  if (!demoCuratorIds || demoCuratorIds.size === 0) return playlists;
  if (isAdminViewer(user)) return playlists;

  const allowedCuratorId = user?.role === 'curator' ? Number(user.curator_id) : null;
  return playlists.filter((playlist) => {
    const curatorId = Number(playlist.curator_id);
    if (!demoCuratorIds.has(curatorId)) return true;
    return allowedCuratorId && curatorId === allowedCuratorId;
  });
};
