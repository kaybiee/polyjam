interface GoogleTokenResponse {
    access_token?: string;
    expires_in?: number;
    error?: string;
}

interface GoogleTokenClient {
    requestAccessToken: (options?: { prompt?: string }) => void;
}

interface GoogleAccountsOAuth2 {
    initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: (response: GoogleTokenResponse) => void;
    }) => GoogleTokenClient;
}

interface GoogleApi {
    accounts: { oauth2: GoogleAccountsOAuth2 };
}

declare global {
    interface GoogleProfile {
        name?: string;
        email?: string;
        picture?: string;
    }

    interface Window {
        google?: GoogleApi;
    }
}

export {};
