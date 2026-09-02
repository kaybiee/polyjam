interface GoogleTokenResponse {
    access_token?: string;
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

interface GooglePickerFile {
    id: string;
    name?: string;
}

interface GooglePickerResponse {
    action: string;
    docs?: GooglePickerFile[];
}

interface GooglePickerView {
    setMimeTypes: (mimeTypes: string) => GooglePickerView;
}

interface GooglePickerApi {
    ViewId: { SPREADSHEETS: string };
    Action: { PICKED: string };
    DocsView: new (viewId: string) => GooglePickerView;
    PickerBuilder: new () => {
        addView: (view: GooglePickerView) => GooglePickerBuilder;
    };
}

interface GooglePickerBuilder {
    setOAuthToken: (token: string) => GooglePickerBuilder;
    setDeveloperKey: (key: string) => GooglePickerBuilder;
    setCallback: (callback: (response: GooglePickerResponse) => void) => GooglePickerBuilder;
    build: () => { setVisible: (visible: boolean) => void };
}

interface GoogleApi {
    accounts: { oauth2: GoogleAccountsOAuth2 };
    picker: GooglePickerApi;
}

declare global {
    interface GoogleProfile {
        name?: string;
        email?: string;
        picture?: string;
    }

    interface Window {
        google?: GoogleApi;
        gapi?: {
            load: (api: string, callback: () => void) => void;
        };
    }
}

export {};
