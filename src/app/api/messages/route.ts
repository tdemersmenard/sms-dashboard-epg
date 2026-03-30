import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { twilioClient, twilioPhoneNumber } from "@/lib/twilio";

// GET messages for a contact
export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId");

  if (!contactId) {
    return NextResponse.json(
      { error: "contactId is required" },
      { status: 400 }
    );
  }

  try {
    // Fetch messages
    const { data: messages, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json(messages || []);
  } catch (err: any) {
    console.error("Error fetching messages:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

// POST - send a new message
export async function POST(request: NextRequest) {
  try {
    const { contactId, body } = await request.json();

    if (!contactId || !body) {
      return NextResponse.json(
        { error: "contactId and body are required" },
        { status: 400 }
      );
    }

    // Get contact phone
    const { data: contact, error: contactError } = await supabaseAdmin
      .from("contacts")
      .select("phone")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Send via Twilio
    const twilioMessage = await twilioClient.messages.create({
      body,
      from: twilioPhoneNumber,
      to: contact.phone,
    });

    // Save to Supabase
    const { data: message, error: msgError } = await supabaseAdmin
      .from("messages")
      .insert({
        contact_id: contactId,
        twilio_sid: twilioMessage.sid,
        direction: "outbound",
        body,
        status: twilioMessage.status,
        is_read: true,
      })
      .select()
      .single();

    if (msgError) throw msgError;

    return NextResponse.json(message);
  } catch (err: any) {
    console.error("Error sending message:", err);
    return NextResponse.json(
      { error: err.message || "Failed to send message" },
      { status: 500 }
    );
  }
}
