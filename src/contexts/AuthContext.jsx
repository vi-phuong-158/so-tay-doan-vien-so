import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchProfileAndRoles(userId) {
    try {
      setProfileError(null);
      const { data: profileData, error: profileError } = await supabase.from('profiles').select('*, organization:organizations(*)').eq('id', userId).single();
      if (profileError) throw profileError;
      if (profileData) {
        setProfile(profileData);
      }
      const { data: roleData, error: roleError } = await supabase.from('user_roles').select('*').eq('user_id', userId);
      if (roleError) throw roleError;
      if (roleData) {
        setRoles(roleData.map(r => r.role_code));
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfileError(error.message || 'Lỗi tải hồ sơ');
      setProfile(null);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndRoles(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndRoles(session.user.id);
      } else {
        setProfile(null);
        setProfileError(null);
        setRoles([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const hasRole = (role) => {
    return profile?.account_status === 'ACTIVE' && (roles.includes(role) || roles.includes('SYSTEM_ADMIN'));
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, profileError, roles, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
