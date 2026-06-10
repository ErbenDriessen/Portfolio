// =============================================================
// Erben Driessen — Supabase client + project CRUD helpers
// =============================================================

window.SB_URL = 'https://lfqbnshntboveuzwxpid.supabase.co';
window.SB_KEY = 'sb_publishable_9TxzTIPcICGU4ozWTPijIA_J2H1mBJX';

(function initSupabase() {
  if (!window.supabase || !window.supabase.createClient) {
    console.warn('[supabase] SDK not loaded yet — retrying in 200ms');
    setTimeout(initSupabase, 200);
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
function dbRowToProject(row) {
  return {
    id: row.id,
    title: row.title,
    stack: Array.isArray(row.stack) ? row.stack : [],
    desc: row.description || '',
    image: row.image_url || 'assets/proj-portfolio.png',
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
    if (error) throw error;
    return dbRowToProject(data);
  },

  async update(id, p) {
    const { data, error } = await window.sb
      .from('projects')
      .update(projectToDbRow(p))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return dbRowToProject(data);
  },

  async remove(id) {
    const { error } = await window.sb.from('projects').delete().eq('id', id);
    if (error) throw error;
  },

  async uploadImage(file) {
    if (!window.sb) throw new Error('Supabase not ready');
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await window.sb.storage
      .from('project-images')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    const { data } = window.sb.storage.from('project-images').getPublicUrl(path);
    return data.publicUrl;
  },
};

// ---- Auth helpers ----
window.sbAuth = {
  async signIn(email, password) {
    const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },
  async signOut() {
    await window.sb.auth.signOut();
  },
  async getUser() {
    const { data } = await window.sb.auth.getUser();
    return data.user || null;
  },
  onAuthChange(cb) {
    return window.sb.auth.onAuthStateChange((_event, session) => cb(session ? session.user : null));
  },
};
