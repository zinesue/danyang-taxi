export const money = (amount: number) =>
  `${Math.round(amount).toLocaleString("ko-KR")}원`;
export const distance = (meters: number) =>
  meters < 1000
    ? `${Math.round(meters).toLocaleString("ko-KR")}m`
    : `${(meters / 1000).toFixed(1)}km`;
