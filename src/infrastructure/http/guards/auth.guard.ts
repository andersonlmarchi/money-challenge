import { Injectable, CanActivate } from '@nestjs/common';

/**
 * No-op auth guard. Extension point for a future Identity Provider (OIDC/OAuth2).
 * Health and metrics endpoints are excluded at controller level.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
