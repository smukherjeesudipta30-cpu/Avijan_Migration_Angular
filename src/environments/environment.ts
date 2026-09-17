export const environment = {
  production: true,
  /** Same-origin in production — the API is published behind the same host. */
  apiBaseUrl: '/api/v1',
  /** The chat SignalR hub. Same-origin, alongside the API. */
  hubBaseUrl: '/hubs',
  instituteName: 'Avijan'
};
