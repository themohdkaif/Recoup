import json
import os
import re
from typing import Dict, Any, Optional
from dotenv import load_dotenv
from app.models import CheckoutAbandonment, FailedMandate

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), ".env"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def _get_fallback_nudge(record: Any, flow_type: str) -> Dict[str, str]:
    if flow_type == "checkout":
        val = int(getattr(record, "cart_value", 1200))
        step = getattr(record, "abandoned_at_step", "review").replace("_", " ")
        return {
            "hinglish_text": f"Arre! Aapke cart mein ₹{val:,} ke items wait kar rahe hai. Abhi payment complete karein aur apna order confirm karein — sirf 2 minute lagenge!",
            "english_reference": f"Hey! Items worth ₹{val:,} are waiting in your cart. Complete your payment now to confirm your order — it takes just 2 minutes!",
            "source": "fallback_template",
        }
    elif flow_type == "mandate":
        plan = getattr(record, "subscription_plan", "Pro").replace("_", " ").title()
        amt = int(getattr(record, "amount", 999))
        return {
            "hinglish_text": f"Aapka {plan} subscription autopay process nahi ho paya (₹{amt:,}). Please ek baar payment method check karein taaki services uninterrupted chalti rahein!",
            "english_reference": f"Your {plan} subscription autopay could not be processed (₹{amt:,}). Please verify your payment method to ensure uninterrupted service!",
            "source": "fallback_template",
        }
    else:
        amt = int(getattr(record, "amount", 1000))
        return {
            "hinglish_text": f"Aapka ₹{amt:,} ka payment pending hai. Kripya niche diye gaye link se payment complete karein.",
            "english_reference": f"Your payment of ₹{amt:,} is currently pending. Please use the link below to complete payment.",
            "source": "fallback_template",
        }


def generate_hinglish_nudge(record: Any, flow_type: str) -> Dict[str, str]:
    """
    Generates a natural, conversational Hinglish recovery nudge via Gemini,
    with an English reference translation and deterministic fallback.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or "placeholder" in api_key:
        return _get_fallback_nudge(record, flow_type)

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")

        if flow_type == "checkout":
            val = getattr(record, "cart_value", 1000)
            items = getattr(record, "items_count", 2)
            step = getattr(record, "abandoned_at_step", "review")
            prompt = f"""You are an empathetic, highly skilled conversational retention copywriter for an Indian e-commerce merchant.
Write a warm, 2-sentence conversational Hinglish (Hindi + English code-mixed in Latin script) recovery nudge for a customer who abandoned their shopping cart.
Context:
- Cart Value: ₹{val:,.2f}
- Item Count: {items}
- Dropped off at step: {step}

Rules:
1. The Hinglish MUST sound natural, like how urban Indian consumers casually text on WhatsApp (e.g. "Aapke cart mein items wait kar rahe hai...").
2. DO NOT use stiff literal dictionary Hindi. Use authentic code-switching between Hindi and English words.
3. Keep it to 2-3 concise sentences.
4. Also generate an English reference translation for non-Hindi readers.

Return ONLY a valid JSON object in this format:
{{
  "hinglish_text": "...",
  "english_reference": "..."
}}
"""
        elif flow_type == "mandate":
            plan = getattr(record, "subscription_plan", "Premium")
            amt = getattr(record, "amount", 999)
            code = getattr(record, "mandate_failure_code", "insufficient_balance")
            prompt = f"""You are a helpful, customer-first retention copywriter for an Indian subscription service.
Write a friendly, 2-sentence conversational Hinglish (Hindi + English code-mixed in Latin script) notification for a recurring subscription payment retry.
Context:
- Subscription Plan: {plan}
- Monthly Amount: ₹{amt:,.2f}
- Reason: {code}

Rules:
1. The Hinglish MUST sound natural, courteous, and modern, like how Indian FinTechs (CRED, Swiggy, Razorpay) communicate on WhatsApp/SMS.
2. DO NOT use stiff Sanskritized Hindi or literal machine translations.
3. Keep it to 2-3 concise sentences reassuring the user and providing a 1-click recovery vibe.
4. Also generate an English reference translation for non-Hindi readers.

Return ONLY a valid JSON object in this format:
{{
  "hinglish_text": "...",
  "english_reference": "..."
}}
"""
        else:
            return _get_fallback_nudge(record, flow_type)

        response = model.generate_content(prompt)
        text = response.text.strip()

        # Clean markdown codeblocks
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        parsed = json.loads(text)
        if "hinglish_text" in parsed and "english_reference" in parsed:
            return {
                "hinglish_text": parsed["hinglish_text"],
                "english_reference": parsed["english_reference"],
                "source": "gemini",
            }
        return _get_fallback_nudge(record, flow_type)

    except Exception as e:
        return _get_fallback_nudge(record, flow_type)
