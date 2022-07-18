export type AuthTokenProps = {
  token_type: string;
  access_token: string;
  scope: string;
  expires_in: number; // seconds
};

export type AuthTokenResponse = AuthTokenProps & {
  refresh_token?: string;
};

export type Track = {
  name: string;
  id: string;
  uri: string;
};

export type PlaylistTrack = {
  track: Track;
};

export type PlaylistResponse = {
  items: PlaylistTrack[];
  total: number;
};
