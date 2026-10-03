import { sb } from '../db.js';
import { toast, errToast } from '../ui.js';

export function view(ctx, { recovering, onRecovered }) {
  ctx.page({ title: '' });
  if (recovering) return newPassword(ctx, onRecovered);

  ctx.render(`<div class="login">
    <img src="icons/icon-192.png" alt="">
    <h1>Dahlias</h1>
    <form class="form">
      <div class="field"><label class="fl"><span class="lbl">Email</span>
        <input type="email" name="email" autocomplete="username" required></label></div>
      <div class="field"><label class="fl"><span class="lbl">Password</span>
        <input type="password" name="password" autocomplete="current-password" required></label></div>
      <div class="form-actions"><button class="btn primary" type="submit">Sign in</button></div>
      <p style="text-align:center;margin-top:14px"><a href="#" data-forgot>Forgot password?</a></p>
    </form></div>`);

  const form = ctx.el.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({
      email: form.email.value.trim(),
      password: form.password.value,
    });
    btn.disabled = false;
    if (error) toast(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message, true);
  });
  form.querySelector('[data-forgot]').addEventListener('click', async e => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email) return toast('Enter your email first.', true);
    const { error } = await sb.auth.resetPasswordForEmail(email);
    if (error) return errToast(error);
    toast('Check your email for a reset link.');
  });
}

function newPassword(ctx, onRecovered) {
  ctx.render(`<div class="login">
    <h1>Set a new password</h1>
    <form class="form">
      <div class="field"><label class="fl"><span class="lbl">New password</span>
        <input type="password" name="password" autocomplete="new-password" minlength="8" required></label></div>
      <div class="form-actions"><button class="btn primary" type="submit">Save password</button></div>
    </form></div>`);
  const form = ctx.el.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.password.value.length < 8) return toast('Use at least 8 characters.', true);
    const { error } = await sb.auth.updateUser({ password: form.password.value });
    if (error) return errToast(error);
    toast('Password updated.');
    onRecovered();
  });
}
