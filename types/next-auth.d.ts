import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    accessToken?: string;
    linkedinId?: string;
    // pouk-auth id_token, used as id_token_hint for RP-initiated logout (ADR-0008).
    idToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    accessTokenExpires?: number;
    linkedinId?: string;
    idToken?: string;
  }
}
