import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/**
 * AuthGuard — Protege todas las rutas que requieren sesión activa.
 * Verifica que exista un user_role en localStorage (establecido por el LoginComponent).
 * Si no hay sesión, redirige a /login.
 */
export const authGuard: CanActivateFn = (_route, _state) => {
    const router = inject(Router);
    const userRole = localStorage.getItem('user_role');

    if (!userRole) {
        router.navigate(['/login']);
        return false;
    }

    return true;
};

/**
 * superAdminGuard — Solo permite acceso al panel de super administrador.
 * Redirige a /metrics si el usuario no es superadmin.
 */
export const superAdminGuard: CanActivateFn = (_route, _state) => {
    const router = inject(Router);
    const userRole = localStorage.getItem('user_role');

    if (!userRole) {
        router.navigate(['/login']);
        return false;
    }

    if (userRole !== 'superadmin') {
        router.navigate(['/metrics']);
        return false;
    }

    return true;
};

/**
 * guestGuard — Evita que usuarios ya autenticados caigan en /login o /register.
 * Como WhatsApp, si ya tienes sesión iniciada te lleva directo a tu panel principal.
 */
export const guestGuard: CanActivateFn = (_route, _state) => {
    const router = inject(Router);
    const userRole = localStorage.getItem('user_role');

    if (userRole) {
        if (userRole === 'superadmin') {
            router.navigate(['/super-admin']);
        } else {
            router.navigate(['/chats']);
        }
        return false;
    }

    return true;
};

/**
 * rootGuard — Resuelve la raíz ('') de la aplicación redirigiendo al panel si hay sesión o a login.
 */
export const rootGuard: CanActivateFn = (_route, _state) => {
    const router = inject(Router);
    const userRole = localStorage.getItem('user_role');

    if (userRole) {
        if (userRole === 'superadmin') {
            router.navigate(['/super-admin']);
        } else {
            router.navigate(['/chats']);
        }
    } else {
        router.navigate(['/login']);
    }
    return false;
};
