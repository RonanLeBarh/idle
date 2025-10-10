import { supabase } from './supabase.js';

export async function registerUser(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName
      }
    }
  });

  if (error) {
    console.error('Registration error:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data, needsEmailConfirmation: !data.session };
}

export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error('Login error:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function logoutUser() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('Logout error:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function linkSessionToAccount(sessionId, userId) {
  const { data: sessionPlayer, error: fetchError } = await supabase
    .from('players')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (fetchError || !sessionPlayer) {
    console.error('Failed to find session player:', fetchError);
    return { success: false };
  }

  const { data: existingPlayer } = await supabase
    .from('players')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingPlayer) {
    const { error: deleteError } = await supabase
      .from('players')
      .delete()
      .eq('session_id', sessionId);

    if (deleteError) {
      console.error('Failed to clean up session:', deleteError);
    }

    return { success: true, playerId: existingPlayer.id };
  }

  const { error: updateError } = await supabase
    .from('players')
    .update({
      user_id: userId,
      session_id: null
    })
    .eq('session_id', sessionId);

  if (updateError) {
    console.error('Failed to link session:', updateError);
    return { success: false };
  }

  return { success: true, playerId: sessionPlayer.id };
}
