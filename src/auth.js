import { supabase } from './supabaseClient.js';

export async function checkUsernameAvailable(username){
  const { data, error } = await supabase.rpc('username_available', { p_username: username });
  if(error) throw error;
  return !!data;
}

export async function setUsername(username){
  const { data, error } = await supabase.rpc('set_username', { p_username: username });
  if(error) throw error;
  return data; // fila de profiles actualizada
}

export async function signUpWithEmail(email, password){
  const { data, error } = await supabase.auth.signUp({ email, password });
  if(error) throw error;
  return data; // data.session es null si el proyecto exige confirmar el email
}

export async function signInWithEmail(email, password){
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if(error) throw error;
  return data;
}

export async function signInWithGoogle(){
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if(error) throw error;
}

export async function signOut(){
  await supabase.auth.signOut();
}

export async function getSession(){
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback){
  return supabase.auth.onAuthStateChange(callback);
}
