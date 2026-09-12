// Seed content for an equipment_owner company's first-run onboarding
// (docs/OWNER-ROADMAP-BRIEF.md §5.1). `seedRestaurantEquipmentTypes()`
// (src/app/dashboard/onboarding/owner/actions.ts) inserts these into
// `equipment_types` — name, description, symptom_chips — skipping any type
// whose lower(name) already exists for the company, so re-running the
// onboarding step is a no-op rather than a duplicate mess.
//
// Content copied verbatim from the brief — do not invent new entries or
// reword the chips; owners can edit both after the fact from
// /dashboard/equipment-types/[id].

export type OwnerEquipmentTemplate = {
  name: string;
  description: string;
  symptom_chips: string[];
};

export const RESTAURANT_EQUIPMENT_TEMPLATES: OwnerEquipmentTemplate[] = [
  {
    name: "Dish machine",
    description: "Commercial dishwasher / warewasher.",
    symptom_chips: [
      "Not draining",
      "Not filling",
      "Not heating",
      "Dishes come out dirty",
      "Leaking",
      "Error code on display",
      "Won't start",
      "Out of detergent",
    ],
  },
  {
    name: "Reach-in cooler",
    description: "Under-counter or upright refrigerator / freezer.",
    symptom_chips: [
      "Not cooling",
      "Freezing product",
      "Ice build-up",
      "Door won't seal",
      "Running constantly",
      "Water on the floor",
      "Loud noise",
      "Error code on display",
    ],
  },
  {
    name: "Walk-in cooler",
    description: "Walk-in refrigeration box and its condensing unit.",
    symptom_chips: [
      "Not cooling",
      "Freezing product",
      "Ice on the evaporator",
      "Water on the floor",
      "Door won't seal",
      "Fan not running",
      "Alarm sounding",
      "Light out",
    ],
  },
  {
    name: "Ice machine",
    description: "Cuber, flaker or nugget machine and its bin.",
    symptom_chips: [
      "Not making ice",
      "Ice tastes or smells bad",
      "Small or hollow cubes",
      "Water leaking",
      "Bin not filling",
      "Won't start",
      "Loud noise",
    ],
  },
  {
    name: "Espresso machine",
    description: "Espresso brewer and steam boiler.",
    symptom_chips: [
      "No water or pressure",
      "Steam wand not working",
      "Group head leaking",
      "Water not hot enough",
      "Error code on display",
      "Won't power on",
      "Grinder not dosing",
    ],
  },
  {
    name: "Coffee brewer",
    description: "Batch brewer and hot water tower.",
    symptom_chips: [
      "Not brewing",
      "Brewing very slowly",
      "Water not hot",
      "Leaking",
      "Won't power on",
      "Descale or service light on",
    ],
  },
  {
    name: "Fryer",
    description: "Gas or electric deep fryer and filtration.",
    symptom_chips: [
      "Not heating",
      "Overheating",
      "Oil leaking",
      "Won't ignite / pilot out",
      "Temperature is off",
      "Filter not working",
      "Error code on display",
    ],
  },
  {
    name: "Range / oven",
    description: "Range top, convection or deck oven.",
    symptom_chips: [
      "Burner won't light",
      "Oven not heating",
      "Uneven heat",
      "Door won't close",
      "Temperature is off",
      "Gas smell — call for help now",
      "Error code on display",
    ],
  },
  {
    name: "Hood / fire suppression",
    description: "Exhaust hood, make-up air and the suppression system.",
    symptom_chips: [
      "Fan not running",
      "Smoke in the kitchen",
      "Filters need service",
      "Light out",
      "Suppression system discharged",
      "Inspection tag expired",
    ],
  },
  {
    name: "Mixer",
    description: "Planetary or spiral dough mixer.",
    symptom_chips: [
      "Won't start",
      "Grinding noise",
      "Bowl won't lift",
      "Attachment won't lock",
      "Leaking oil",
      "Speed won't change",
    ],
  },
  {
    name: "POS terminal",
    description: "Point-of-sale terminal, printer and card reader.",
    symptom_chips: [
      "Won't power on",
      "Offline / no network",
      "Card reader not reading",
      "Printer not printing",
      "Screen frozen",
      "Cash drawer won't open",
    ],
  },
  {
    name: "HVAC",
    description: "Building heating and air conditioning.",
    symptom_chips: [
      "Not cooling",
      "Not heating",
      "No airflow",
      "Thermostat unresponsive",
      "Water leaking",
      "Loud noise",
      "Filter needs changing",
    ],
  },
];
