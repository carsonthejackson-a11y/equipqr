import type { FaqEntry } from "./faq-item";
import { SUPPORT_EMAIL } from "@/lib/site";
import { TRIAL_DAYS } from "@/lib/plans";

export const productFaqs: FaqEntry[] = [
  {
    question: "Do my customers need to download an app or make an account?",
    answer:
      "No. Scanning the sticker opens a mobile web page — no app store, no login, no account for your customer to create. If the guide doesn't fix it, they submit a service request right from that same page.",
  },
  {
    question: "How do I build the troubleshooting guides?",
    answer:
      "Describe the equipment type and its common failure modes once, and EquipQR drafts a full branching guide in minutes using AI. Review it, edit any step, and publish — every unit of that equipment type uses it from then on.",
  },
  {
    question: "What happens if the guide doesn't fix the problem?",
    answer:
      "The customer submits a service request with photos or a short video straight from their phone. You get an email with an AI-written summary of what they already tried, so you can dispatch the right tech with the right parts on the first trip.",
  },
  {
    question: "Can I print my own stickers, or do you print them for me?",
    answer:
      "Both. Download a print-ready SVG or PNG for any QR code from the dashboard, or order a batch of pre-printed, pre-linked stickers shipped to you — good for stocking a truck ahead of a route.",
  },
  {
    question: "What does a customer see if a sticker hasn't been assigned to a unit yet?",
    answer:
      "A plain 'this isn't set up yet, contact the service company' message — no dead links, no confusion. If one of your technicians scans it while signed in, they can claim it to a piece of equipment on the spot.",
  },
  {
    question: "Can I control what my team can see and do?",
    answer:
      "Yes. Owners manage billing, the team, and company settings. Technicians can manage equipment, customers, and service requests but can't touch billing or remove the company. Every account belongs to exactly one company, and data never crosses between companies.",
  },
];

export const billingFaqs: FaqEntry[] = [
  {
    question: "Is there really a free trial, and is a card required?",
    answer: `Every plan starts with a ${TRIAL_DAYS}-day free trial with full Pro features unlocked — no credit card required to start. You'll only be asked for billing details if you decide to keep going.`,
  },
  {
    question: "What happens if I hit my equipment limit?",
    answer:
      "You won't be charged an overage or get cut off mid-job. When you're at your plan's unit limit, you'll see a prompt to upgrade the next time you try to add equipment — your existing units and guides keep working normally.",
  },
  {
    question: "Can I switch plans later?",
    answer:
      "Yes, upgrade or downgrade at any time from Settings → Billing. Changes are prorated against your current billing period, so you're never paying twice.",
  },
  {
    question: "How much do I save paying annually?",
    answer:
      "Annual billing is two months free compared to paying monthly — you pay for 10 months and get the full year.",
  },
  {
    question: "How is my card handled?",
    answer:
      "Payments are processed by Stripe. EquipQR never sees or stores your card number — only Stripe's tokenized reference to it.",
  },
  {
    question: "Can I cancel anytime?",
    answer: `Yes. Cancel from Settings → Billing whenever you like; you'll keep access through the end of the period you already paid for. Questions? Email ${SUPPORT_EMAIL}.`,
  },
];
