
export class AuthGuard {
    private readonly authRepository: any;
    constructor(authRepository: any) {
        this.authRepository = authRepository;
    }

    verifyJWT(token: string): boolean {
        return false;
    }

    refreshJWT(token: string): string {
        return '';
    }

    revokeJWT(token: string): void {
        
    }

    createJWT() {
        return {};
    }
}