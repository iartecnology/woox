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
