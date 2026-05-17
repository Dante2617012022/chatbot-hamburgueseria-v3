export async function createMercadoPagoPreference(body) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN.");
  }

  const { MercadoPagoConfig, Preference } = await import("mercadopago");

  const client = new MercadoPagoConfig({
    accessToken
  });

  const preference = new Preference(client);

  return preference.create({
    body
  });
}

export async function getMercadoPagoPayment(paymentId) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("Falta MERCADOPAGO_ACCESS_TOKEN.");
  }

  if (!paymentId) {
    throw new Error("paymentId es obligatorio.");
  }

  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Mercado Pago respondió ${response.status}: ${errorText}`
    );
  }

  return response.json();
}
