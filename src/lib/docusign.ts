/* eslint-disable @typescript-eslint/no-require-imports */
// docusign-esign uses CommonJS bare requires internally — must use require here
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const docusign = require("docusign-esign") as any;

import { supabaseAdmin } from "@/lib/supabase";

export async function getDocuSignClient() {
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", "docusign_tokens")
    .single();

  if (!data?.value) {
    throw new Error("DocuSign not connected. Go to /settings to connect.");
  }

  const tokens = JSON.parse(data.value);
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net/restapi");
  apiClient.addDefaultHeader("Authorization", `Bearer ${tokens.access_token}`);

  return apiClient;
}

export async function sendForSignature(
  pdfBuffer: Buffer,
  docNumber: string,
  clientName: string,
  clientEmail: string,
  service: string,
  amount: number
): Promise<string> {
  const apiClient = await getDocuSignClient();
  const envelopesApi = new docusign.EnvelopesApi(apiClient);
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;

  const pdfBase64 = pdfBuffer.toString("base64");

  const envelope = new docusign.EnvelopeDefinition();
  envelope.emailSubject = `Contrat ${docNumber} — Entretien Piscine Granby`;
  envelope.emailBlurb = `Bonjour ${clientName}, veuillez signer votre contrat pour le service d'entretien de piscine. Montant: ${amount}$`;
  envelope.status = "sent";

  const document = new docusign.Document();
  document.documentBase64 = pdfBase64;
  document.name = `${docNumber}.pdf`;
  document.fileExtension = "pdf";
  document.documentId = "1";
  envelope.documents = [document];

  const signer = new docusign.Signer();
  signer.email = clientEmail;
  signer.name = clientName;
  signer.recipientId = "1";
  signer.routingOrder = "1";

  const signHere = new docusign.SignHere();
  signHere.anchorString = "Signature du client";
  signHere.anchorUnits = "pixels";
  signHere.anchorYOffset = "-10";
  signHere.anchorXOffset = "0";

  const dateSigned = new docusign.DateSigned();
  dateSigned.anchorString = "Date: ___";
  dateSigned.anchorUnits = "pixels";
  dateSigned.anchorYOffset = "0";
  dateSigned.anchorXOffset = "50";

  const tabs = new docusign.Tabs();
  tabs.signHereTabs = [signHere];
  tabs.dateSignedTabs = [dateSigned];
  signer.tabs = tabs;

  const recipients = new docusign.Recipients();
  recipients.signers = [signer];
  envelope.recipients = recipients;

  const result = await envelopesApi.createEnvelope(accountId, { envelopeDefinition: envelope });

  console.log("[docusign] Envelope sent:", result.envelopeId);
  return result.envelopeId as string;
}
