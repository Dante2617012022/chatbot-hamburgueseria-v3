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
