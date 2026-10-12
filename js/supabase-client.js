// =============================================================
// Erben Driessen · Supabase client + project CRUD helpers
// Used by admin.html (read + write) and the v1 homepage (read only).
//
// The key below is the PUBLISHABLE key: it's meant to be public and
// can only do what the RLS policies allow (anon = read only).
// Writes are only allowed for the owner's user id, enforced by RLS
// in Supabase, not by anything in this file. See README "Security".
// =============================================================

window.SB_URL = 'https://lfqbnshntboveuzwxpid.supabase.co';
window.SB_KEY = 'sb_publishable_9TxzTIPcICGU4ozWTPijIA_J2H1mBJX';
window.SB_BUCKET = 'project-images';

(function initSupabase(tries) {
  if (!window.supabase || !window.supabase.createClient) {
    // the SDK is loaded right before this file; give a slow CDN ~10 s, then stop
    if ((tries || 0) < 50) setTimeout(function () { initSupabase((tries || 0) + 1); }, 200);
    else console.warn('[supabase] SDK did not load');
    return;
  }
  window.sb = window.supabase.createClient(window.SB_URL, window.SB_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: window.localStorage,
      storageKey: 'ed_sb_session',
    },
  });
})();

// ---- Project helpers ----
// Convert a DB row → the shape the front-end expects.
// No image → '' (the pages show their own placeholder).
function dbRowToProject(row) {
  return {
    id: row.id,
    title: row.title,
    stack: Array.isArray(row.stack) ? row.stack : [],
    desc: row.description || '',
    image: row.image_url || '',
    link: row.link || null,
    linkLabel: row.link_label || null,
    year: row.year || '',
    category: row.category || 'other',
    featured: !!row.featured,
    source: 'db',
  };
}

// Convert a form payload → DB row shape.
function projectToDbRow(p) {
  return {
    title: p.title,
    stack: p.stack,
    description: p.desc,
    image_url: p.image,
    link: p.link || null,
    link_label: p.linkLabel || null,
    year: p.year || '',
    category: p.category || 'other',
    featured: !!p.featured,
  };
}

// A public URL of a file in our own bucket → its path inside the bucket.
// Anything else (another host, another bucket, a render URL) → null.
function storagePathFromUrl(url) {
  var prefix = window.SB_URL + '/storage/v1/object/public/' + window.SB_BUCKET + '/';
  var u = String(url || '');
  if (u.indexOf(prefix) !== 0) return null;
  var path = u.slice(prefix.length).split(/[?#]/)[0];
  try { path = decodeURIComponent(path); } catch (e) { return null; }
  return path && path.indexOf('..') < 0 ? path : null;
}

// RLS blocks show up as odd errors (or none at all): name them plainly.
function writeError(error) {
  if (error && (error.code === 'PGRST116' || error.code === '42501' || /row-level security/i.test(error.message || ''))) {
    const e = new Error("The database didn't allow this change. Only the owner account can edit (RLS).");
    e.code = error.code;
    return e;
  }
  return error;
}

window.sbProjects = {
  async list() {
    if (!window.sb) return [];
    const { data, error } = await window.sb
      .from('projects')
      .select('*')
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) { console.warn('[sbProjects.list]', error); return []; }
    return (data || []).map(dbRowToProject);
  },

  async create(p) {
    const { data, error } = await window.sb
      .from('projects')
      .insert(projectToDbRow(p))
      .select()
      .single();
    if (error) throw writeError(error);
    return dbRowToProject(data);
  },

  async update(id, p) {
    const { data, error } = await window.sb
      .from('projects')
      .update(projectToDbRow(p))
      .eq('id', id)
      .select()
      .single();
    if (error) throw writeError(error);
    return dbRowToProject(data);
  },

  // a delete that RLS doesn't allow "succeeds" with 0 rows, so ask for the rows back
  async remove(id) {
    const { data, error } = await window.sb.from('projects').delete().eq('id', id).select('id');
    if (error) throw writeError(error);
    if (!data || !data.length) throw writeError({ code: '42501' });
  },

  // Upload a File or Blob (admin.html resizes it first) → its public URL.
  // File names are unique, so the file can be cached for a year.
  async uploadImage(file) {
    if (!window.sb) throw new Error('Supabase not ready');
    const type = file.type || 'application/octet-stream';
    const ext = type === 'image/webp' ? 'webp' : type === 'image/jpeg' ? 'jpg'
      : ((file.name || '').split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await window.sb.storage
      .from(window.SB_BUCKET)
      .upload(path, file, { cacheControl: '31536000', contentType: type, upsert: false });
    if (error) throw error;
    const { data } = window.sb.storage.from(window.SB_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },

  // Remove a file we uploaded earlier, by its public URL.
  // Never throws: resolves { removed: true } or { removed: false, reason }.
  // Storage answers a delete that RLS doesn't allow with an empty list
  // (no error), so "nothing removed" counts as a failure too.
  async removeImage(url) {
    const path = storagePathFromUrl(url);
    if (!path) return { removed: false, reason: 'not-ours' };
    if (!window.sb) return { removed: false, reason: 'Supabase not ready' };
    try {
      const { data, error } = await window.sb.storage.from(window.SB_BUCKET).remove([path]);
      if (error) return { removed: false, reason: error.message || 'error' };
      if (!data || !data.length) return { removed: false, reason: 'not-allowed' };
      return { removed: true };
    } catch (e) {
      return { removed: false, reason: (e && e.message) || 'error' };
    }
  },

  storagePathFromUrl: storagePathFromUrl,
};

// ---- Auth helpers ----
window.sbAuth = {
  async signIn(email, password) {
    if (!window.sb) throw new Error('Could not reach Supabase. Try again in a moment.');
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },
  async signOut() {
    await window.sb.auth.signOut();
  },
  // asks the server, so a stale or edited local session doesn't count
  async getUser() {
    const { data } = await window.sb.auth.getUser();
    return (data && data.user) || null;
  },
  onAuthChange(cb) {
    return window.sb.auth.onAuthStateChange((_event, session) => cb(session ? session.user : null));
  },
};
