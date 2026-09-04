# Recipe Systems

Complete working document. Combines the Kanyakumari curry analysis, the nine views, chef mode, the product plan, and user stories.

- Status: working draft
- Date: 28 August 2026
- Golden fixture: Kanyakumari meen kuzhambu ingredient card (Chef Deena’s Kitchen CDK 1669 / Mrs. Anitha, Palma Garden, Kottavilai)
- Modes: Home mode and Chef mode

---

## 1. What this is

Recipe Systems is a recipe analysis product, not a recipe generator.

A person enters a recipe — typed, pasted, or photographed from a card — and the system returns a structured briefing across nine fixed views. The person can save the recipe, print a shopping list, print a station card, cook, and log what happened.

The nine views are the product. They are contracts, not a writing style.

| # | View | Question it answers |
|---|---|---|
| 1 | Ingredient-function | Why is each line here, and what fails if it is omitted? |
| 2 | Taste pillars | What is happening on the tongue? |
| 3 | Process and timing | When is each job allowed to happen? |
| 4 | Load-bearing vs modular | What may I touch? |
| 5 | Comparative / regional | Why this combination, on this coast? |
| 6 | Ratio / architecture | What are the proportions saying? |
| 7 | Sensory and time | What does the mouth get, and what does tomorrow do? |
| 8 | Dietary restrictions | What is present, absent, unknown, and what would a restriction do to the dish? |
| 9 | Calories and micronutrients | What energy and nutrient *band* can this card support? |

Home mode explains. Chef mode briefs. Both read the same structured recipe object. Neither may invent an ingredient that is not in that object.

---

## 2. Origin

The first input was a photograph of a printed list from Deena’s Kitchen:

- Fish — 500g
- Tomato — 1 Nos
- Drumstick — 1 Nos
- Mango — 1/2 Nos
- Green Chilli — 5 Nos
- Grated Coconut — Half Shell
- Chilli Powder — 2 Tsp
- Coriander Powder — 1 Tsp
- Cumin Seeds — 1/4 Tsp
- Turmeric Powder — 1/2 Tsp
- Shallots — 10 Nos
- Salt — To Taste
- Tamarind — A Lemon Size
- Fenugreek Powder — 1/2 Tsp
- Pepper Powder — 1/2 Tsp
- Mustard — 1/2 Tsp
- Fenugreek — 1/4 Tsp
- Curry Leaves — As Required
- Coconut Oil — For Tempering

No method on the image. “Nos” means pieces. Drumstick is moringa pod. Mango is raw/green. Fenugreek appears twice on purpose (powder in the pot, seeds in the tadka).

Matched source for method: CDK 1669, cook Mrs. Anitha. Method claims below that depend on that video are tagged **INFERRED**, not **CARD**.

If the product cannot survive this card — wrap-around “Chilli Powder - 2 Tsp Coriander Powder,” two fenugreeks, half a shell, a lemon-size tamarind, unnamed fish — it has failed its own story.

---

## 3. Principles that every view inherits

1. **Source of truth.** The structured recipe object is the only mise. If an item is not in the object, no view may use it except to mark it **ABSENT**.
2. **Tagged claims.** Every claim wears one of: `CARD`, `METHOD`, `INFERRED`, `ABSENT`, `UNKNOWN`, `ASSUMED`.
3. **Lenses may disagree.** View 2 under-reports coriander. View 1 does not. Show both.
4. **Refuse empty method.** No method and no accepted family match → Views 3 and 7 render **INCOMPLETE**. Do not fabricate a tadka.
5. **Untasted.** Analysis is a briefing. After-cook capture is how taste enters the system.
6. **Print is first-class.** Shopping list and station card must work on paper.
7. **No certificates.** View 8 never writes “safe to eat.” View 9 never writes a fake point-calorie when inputs are ranges.
8. **Golden fixture never leaves CI.** Garlic must never appear on this card. The two fenugreeks must not merge. View 9 must not print `487 kcal` as fact.

---

## 4. How to analyse a recipe (the method stack)

No single lens is “the best.” Use three passes, then the rest as needed.

1. **Function** — what each item does
2. **Balance** — salt / fat / acid / heat / bitter / sweet / aroma / umami / earth
3. **Process** — when those jobs are unlocked

Then 4–7 for cooking and cuisine, 8–9 for restrictions and nutrition bands.

| If you want to… | Use |
|---|---|
| Understand a new cuisine | 1 + 5 |
| Fix a curry that tastes off | 2 |
| Cook it well the first time | 3 |
| Substitute from the fridge | 4 |
| Write or scale a recipe | 6 |
| Explain why it is memorable | 7 |
| Check allergens / diets | 8 |
| Estimate energy | 9 |

---

## 5. Identification

| Field | Value | Tag |
|---|---|---|
| Family | Coastal Tamil *meen kuzhambu*, Kanyakumari / Kumari | INFERRED from matched list |
| Architecture | Raw-ground coconut paste, triple sour, late fenugreek + pepper, coconut-oil tadka last | INFERRED |
| Confidence | High on ingredients. Medium-high on method. | |
| Not this | Inland Tamil gingelly-oil kuzhambu. Kerala kudampuli *meen curry*. Roasted-coconut *varutharacha*. | |
| ABSENT on card | Ginger, garlic, coconut milk, kudampuli, sesame oil | CARD |

---

## 6. The nine views — worked example

### View 1 — Ingredient-function

| Item | Job | If omitted |
|---|---|---|
| Fish 500g | Protein, fat, reason for the sour | Not this dish |
| Coconut, half shell | Body and fat of the gravy | Thin tamarind stew |
| Tamarind, lemon-size | Deep acid | Oily and flat unless mango is very sour |
| Raw mango ½ | Bright acid + edible pieces | Still a kuzhambu if tamarind is kept |
| Tomato 1 | Soft acid, some body and umami | Acceptable |
| Chilli powder 2 tsp | Base heat and colour | Only fresh-chilli heat |
| Green chilli × 5 | Fresh, grassy heat | One-dimensional spice |
| Coriander 1 tsp | Rounds chilli, adds paste body | Hotter, thinner masala. Dish still stands |
| Cumin ¼ tsp | Minor earth in the paste | Small loss |
| Turmeric ½ tsp | Colour, slight earth | Visual more than structural |
| Shallots × 10 | Sweet allium base | Harsher if replaced by large raw onion |
| Fenugreek powder ½ tsp | Bitter-aroma finish; late addition | Loses the family smell; early addition turns bitter |
| Pepper ½ tsp | Late sharp heat | Heat becomes only chilli |
| Mustard + fenugreek seed + curry leaf + coconut oil | Finish aroma | Cooked but not finished |
| Drumstick 1 | Texture / seasonal extra | No structural loss |
| Salt | Seasons the poaching liquid | Fish stays bland inside |

**How they sit together**

| Role | Ingredients |
|---|---|
| Body / richness | Coconut, shallots, tomato, fish fat |
| Sour | Tamarind (deep) + raw mango (bright) + tomato (soft) |
| Heat | Chilli powder (steady) + green chilli (fresh) + pepper (sharp, late) |
| Bitter / “fish-curry” aroma | Fenugreek powder + fenugreek seeds |
| Perfume | Curry leaves, mustard, coconut oil |
| Texture extra | Drumstick pulp |

---

### View 2 — Taste pillars

Classic salt / fat / acid / heat, plus bitter, sweet, aroma, umami, and the missing column this recipe forced: **earth / round / body**.

| Pillar | How this recipe gets it | If missing, the curry tastes… |
|---|---|---|
| Salt | Added to the masala before the fish | Dull, even if spicy |
| Fat | Grated coconut + fish oil + finishing coconut oil | Thin, sharp, “just sour water” |
| Acid | Tamarind + raw mango + tomato | Heavy, oily, flat |
| Heat | Chilli powder + green chilli + late pepper | One-note |
| Bitter | Fenugreek powder and seeds | Generic spicy stew, not this coast |
| Sweet | Shallots + coconut + ripe tomato | Harsh |
| Aroma | Curry leaves, mustard pop, coconut oil, late pepper | Cooked but not finished |
| Umami | Fish + tomato | Less savoury |
| Earth / round / body | **Coriander**, cumin, turmeric, coconut solids | Thinner, hotter, less like a masala |

**Blind spot of this method.** Coriander does not own salt, fat, acid, heat, or bitter. It is a bridge spice (linalool: citrusy-woody; soft sweetness; paste body; chilli buffer). The 2 tsp chilli : 1 tsp coriander ratio is structural for the paste. View 2 will under-report it. View 1 will not. That disagreement is required output, not a bug.

Cumin and turmeric have the same problem. Fenugreek does not — it owns bitter.

---

### View 3 — Process and timing

This is a **raw-ground pot curry**. Gravy first. Fish poached in it. Perfume last.

**Stage 0 — Before the flame**

- Soak tamarind, squeeze, strain. Liquid sour, not pulp in the pot.
- Cut fish in steaks that stay whole. Scrape drumstick. Wedge raw mango. Slit chillies. Shallots whole or halved.
- Grind **raw**, not roasted: half-shell coconut + chilli powder + coriander + cumin + turmeric + water to a pourable paste.
- Roasting the coconut here is another dish (*varutharacha*).

**Stage 1 — Build the liquid the fish will live in**

Earthen pot if you have one (**UNKNOWN** whether clay is required; source used it). Paste + tamarind water + salt. The liquid must taste seasoned *before* the fish goes in.

**Stage 2 — Load, then heat**

Order from the matched source (**INFERRED**): fish, drumstick, green chillies, mango, tomato, shallots. Cover. High heat to a boil, then medium. About 5–6 minutes after the boil — use the **cue**, not only the clock.

Cue: fish opaque and just flaking; mango still holding shape; drumstick scrapeable, may stay slightly firm. Fish wins the short cook. Do not stir like dal.

**Stage 3 — Late powders**

Fenugreek powder ½ tsp and pepper ½ tsp when the fish is just done. Off or barely on heat. Early fenugreek goes bitter. Late fenugreek keeps aroma.

**Stage 4 — Tadka last**

Hot coconut oil. Mustard until it pops. Fenugreek seeds only to first colour — seconds. Curry leaves with stalk. Pour over. Lid on one minute.

**If you shuffle the steps**

| If you… | What happens |
|---|---|
| Roast the coconut and spices | Different dish: darker, nuttier |
| Start with tadka, then build gravy | Aroma is boiled off |
| Add fenugreek powder with the paste | Bitterness throughout |
| Cook drumstick 10 minutes, then add fish | Fish overcooks |
| Stir the fish hard | Pieces break; gravy turns muddy |
| Skip the cover after tadka | Top-note oil does not settle |

---

### View 4 — Load-bearing vs modular

| Class | Items | Touch it and… |
|---|---|---|
| Structural | Fish; coconut body; at least one real sour; fenugreek in some form; coconut-oil leaf tadka; salt in the liquid | Different dish or a broken one |
| Modular | Drumstick, tomato, chilli count, pepper vs more chilli, shallot count | Same family |
| Identity shift | Gingelly oil; kudampuli; roasted coconut; coconut milk boiled hard; large onion uncooked | Walks to another coast or another recipe |

**Useful swaps**

- No raw mango → more tamarind, or lime at the end. Loses fruit pieces. Dried raw mango is the traditional off-season stand-in; amchur is not.
- No tamarind, mango only → seasonal version the source kitchen described. Needs a sour green mango.
- Kudampuli instead of tamarind → Kerala *meen curry*.
- Coconut milk instead of grated coconut → silkier Malabar cousin. Add milk after the sour base boils. Keep heat gentle.
- Big onion instead of shallots → edible, harsher, more water.
- Gingelly oil instead of coconut oil → inland Tamil kuzhambu.
- No fenugreek → still sour-coconut-hot. Will not smell like this family.
- Vegetarian → brinjal or drumstick + mango in the same gravy. Architecture kept. Reason for fenugreek mostly lost.

**Substitution rule.** Ask: which *job* did this do, and does the substitute do that job in the *same time slot*? Lime can replace mango’s acid, not its flesh, and must go in late.

---

### View 5 — Comparative / regional

Kanyakumari sits on the Tamil–Kerala line.

| | This card | Inland Tamil meen kuzhambu | Kerala meen curry |
|---|---|---|---|
| Fat | Coconut paste + coconut oil | Often gingelly oil, less coconut | Coconut oil, sometimes coconut milk |
| Sour | Tamarind + mango + tomato | Mostly tamarind | Often kudampuli |
| Veg | Drumstick + mango | Usually none | Sometimes mango or drumstick |
| Fenugreek | Powder late + seeds in tadka | Usually seeds in tadka | Usually seeds in tadka |
| Onion | Shallots | Shallots or onion | Shallots |

- Keep tamarind + tomato + raw coconut paste + coconut oil → Kumari / south Tamil coast.
- Swap kudampuli for tamarind → Kerala *meen curry*.
- Swap gingelly oil and drop the coconut paste → inland Tamil kuzhambu.
- Roast the coconut → *varutharacha*.

View 5 may use a map. It may not use a postcard (“soul of the coast”).

---

### View 6 — Ratio / architecture

Per 500g fish (**CARD**):

- Coconut: half a nut. Do not halve this if you keep 500g fish.
- Chilli powder : coriander = 2 tsp : 1 tsp.
- Fenugreek powder ½ tsp is a ceiling.
- Fenugreek seed ¼ tsp is a ceiling.
- Green chilli × 5 is aggressive; cut here before cutting powder if you need less fire.
- Water: **UNKNOWN**. Target: pieces three-quarters submerged; gravy coats rice; not soup, not paste.
- 10 shallots is a base, not a garnish.

Double the fish and keep half a coconut → thin stew. Keep the coconut and double the fenugreek → medicine.

---

### View 7 — Sensory and time

**In the spoon:** flake of fish, sour mango, scrape of drumstick, slight grain from raw-ground coconut, crisp curry leaf from the tadka.

**Hot hold:** poor. Fish keeps cooking and weeps. Aroma flattens. Cook to order, or hold off heat and reheat once gently.

**Next day:** gravy binds; sour settles. That is gravy improvement, not fish improvement. Cool fast. Reheat once to just hot.

---

### View 8 — Dietary restrictions

Flag view. Not a medical certificate. Never write **safe**. Write **present / not on card / unknown / removing this is a different recipe**.

Two label packs render together. Mustard is EU/UK 14 and not a US major 9. Coconut is declared by name; as of FDA Edition 5 (January 2025) it is **not** a US major tree-nut allergen. Fenugreek is a legume with possible peanut cross-reactivity; not statutory on either list.

**On this card**

| Item | Status | Notes |
|---|---|---|
| Fish | Present (US + EU) | Species **UNKNOWN** |
| Mustard seeds | Present (EU 14) | Tadka only. Modular to omit. Still flag |
| Coconut flesh + oil | Declared ingredient | Not US major tree nut. Still coconut |
| Fenugreek seed + powder | Note | Legume. Not statutory |
| Milk, egg, wheat, soy, peanut, sesame, shellfish, celery, lupin, sulphites | Not on card | Mill / shared equipment still **UNKNOWN** |
| Garlic / ginger | Absent | Do not invent |

**Pattern compatibility (Fits card / Conflicts / Unknown — never Safe)**

| Pattern | On this card |
|---|---|
| Vegetarian / vegan | Conflicts. Fish is structural |
| Pescatarian | Fits the card. Kitchen contact unknown |
| Dairy-free / egg-free / shellfish-free | Fits the card |
| Gluten-free | **Unknown** (spice powders) |
| Nut-free | No named tree nuts. Coconut is still here |
| Halal | Fish generally accepted; species unknown |
| Kosher | **Unknown**. Needs fins-and-scales species |
| Allium-free | Conflicts (10 shallots) |
| Nightshade-free | Conflicts (tomato, chilli) |

**Adaptation cost**

- No fish or no coconut → identity shift. Not this dish.
- No mustard seeds → modular. Keep oil + curry leaves.
- Fewer green chillies → modular.

**Print line**

Contains: **fish**, **mustard**. Also on card: **coconut**, **fenugreek (legume)**. Fish species unknown. Reads the card only. Not an allergen certificate.

**Disclaimer (every surface):** Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.

---

### View 9 — Calories and micronutrients

Estimate view. Versioned food-composition table (USDA FoodData Central or equivalent), not model-invented arithmetic. Bands, not points, when inputs are ranges. A point value such as `487 kcal` on this fixture is a fail.

**Assumptions (ASSUMED, not CARD)**

| Input | Card says | Default band |
|---|---|---|
| Fish 500g | Species unknown | Lean snapper-type ~100 kcal/100g → oily mackerel-type ~200 kcal/100g |
| Coconut | Half shell | 150–200 g edible grated meat (not “1 cup shredded” = 80 g) |
| Coconut oil | For tempering | 1–2 tbsp (14–28 g) |
| Portions | Not stated | No per-bowl number until the user sets 3 or 4 |
| Salt | To taste | Sodium **Unknown** |

**Whole-pot band**

| | Lean-fish end | Oily-fish end |
|---|---|---|
| Energy | ~1,300 kcal | ~2,200 kcal |
| Protein | ~95–110 g | ~90–110 g |
| Fat | Coconut-led | Coconut + fish oil |
| Carbohydrate | Modest | Modest |
| Fibre | Coconut + drumstick + shallot | |
| Sodium | Unknown | Unknown |

If the user sets 4 portions: ~330–550 kcal per bowl. Still a band.

**Short micronutrient panel**

| Nutrient | Reading | Confidence |
|---|---|---|
| Protein | High. Almost all from 500g fish | High |
| Saturated fat | High. Coconut meat ~30 g sat fat / 100 g | High |
| Vitamin C | Mango, tomato, chilli, drumstick. Raw drumstick pods are very high in C; boiling cuts that. Do not plate raw-pod 141 mg/100g | Medium |
| Potassium | Drumstick, coconut, tomato, tamarind | Medium |
| B12, selenium | Fish. Depends on species | Low until named |
| Omega-3 | Unknown until the fish is named | Unknown |
| Sodium | Unknown | Unknown |
| Manganese / copper | Coconut | Medium |

**What tightens the band:** name the fish, weigh the coconut, measure the tadka oil, set portions. Those three energy levers (fish class, coconut mass, oil) are most of the 900 kcal swing.

**Disclaimer:** Table estimate from stated assumptions. Not a lab analysis of this pot. Not medical advice.

---

## 7. Chef mode spec

Chef mode is not a fancier essay. It is a briefing.

**Job.** Get a trained cook from card to pot without folklore and without invented mise.

**Non-job.** Delight. “Soul of the coast.” Nutrition coaching. Certifying taste.

### Voice

- Short sentences. Technical words over poetic ones.
- Doneness and heat over clock time. Clock may follow the cue.
- No “secret,” “magic,” “authentic soul.” If a cook said something, attribute it.
- The system is not a chef. Write “this card states” / “this method infers.”

### Output order

1. Identification + confidence
2. Station card
3. Control points
4. Product / yield / hold
5. Compressed nine views
6. Open questions
7. Line: *Untasted briefing. Season after.*

### Required blanks

Leave blank rather than invent: fish species and cut; coconut freshness; pot material; yield; hold time; exact water; oil volume; salt mass.

### Refusal

- No method + no identified family → Views 3 and 7 **INCOMPLETE**.
- Photo of ingredients only → method **INFERRED** if a sourced match exists, else missing.
- Request to certify taste → refuse.

### Home vs chef (all views)

| View | Home mode | Chef mode |
|---|---|---|
| 1 Function | Why each ingredient exists | Job + failure if omitted |
| 2 Pillars | Friendly balance table | Diagnostic only. Missing columns called out |
| 3 Process | Narrative walkthrough | Sequence, heat, cue, failure |
| 4 Load-bearing | What you can skip | Structural / modular / identity-shift grid |
| 5 Regional | Story of the coast | Neighbour dishes and the swap that moves the border |
| 6 Ratio | Prose about proportions | Working ratios against 500g fish |
| 7 Sensory | “Tastes better tomorrow” | Texture stack + hold physics |
| 8 Dietary | Plain conflicts | Allergen brief + cannot-guarantee list |
| 9 Nutrition | “Coconut-and-fish dense” | Assumption log + bands |

---

## 8. Chef mode — station card for this curry

**For:** 500g fish **CARD**
**Pot:** heavy or earthen, pieces in one layer. Clay **UNKNOWN**.

**Mise**

- Tamarind, lemon-size, soaked, strained **CARD**
- Paste: half-shell fresh grated coconut + 2 tsp chilli powder + 1 tsp coriander + ¼ tsp cumin + ½ tsp turmeric + water to pourable **CARD** / water volume **UNKNOWN**
- Fish 500g, steaks **CARD**; species **UNKNOWN** (source kitchen used local snapper / *sankara*-type)
- Drumstick × 1, scraped, 5–7 cm **CARD**
- Raw mango × ½, wedges **CARD**
- Tomato × 1, chunks **CARD**
- Shallots × 10, whole or halved **CARD**
- Green chilli × 5, slit **CARD**
- Fenugreek powder ½ tsp, pepper ½ tsp — held back **CARD**
- Tadka: coconut oil, mustard ½ tsp, fenugreek seeds ¼ tsp, curry leaves with stalk **CARD**

**Sequence** **INFERRED** from CDK 1669 / Mrs. Anitha

1. Paste + tamarind water + salt. Taste the liquid.
2. Fish, then drumstick, chilli, mango, tomato, shallots. Cover.
3. Boil on high, then medium. Do not stew.
4. Stop when fish is just set.
5. Fenugreek powder + pepper. Off heat.
6. Tadka in a second pan. Pour over. Lid 1 minute.

**Do not:** roast the coconut; start with tadka; add fenugreek powder to the raw paste; boil after the powders; stir the fish hard.

**Control points**

1. Paste is raw. Roast it and you have another dish.
2. Fish doneness vs drumstick. Short cook. Fish wins.
3. Fenugreek twice, two times. Powder at the end or it goes bitter. Seeds in oil only until they smell.

**Product / yield / hold**

| Field | Status |
|---|---|
| Fish | Firm, steak-able. Species UNKNOWN |
| Coconut | Freshly grated. Desiccated fails the paste |
| Mango | Unripe, sour |
| Oil | Coconut oil CARD. Volume UNKNOWN |
| Yield | UNKNOWN. 500g fish typically 3–4 with rice |
| Hot hold | Poor |
| Next day | Gravy binds; fish texture suffers if it sat at a boil |

**Open questions:** which fish; how much water; how much oil; fresh vs frozen coconut; whether the pot must be clay; how sour today’s mango is.

---

## 9. Product

### Loop

Intake → Confirm parse → Analyse (home or chef) → Save → Shop / print → Cook → Capture result → Reopen later

### In scope / out of scope (12-week pilot)

| In scope | Out of scope |
|---|---|
| Text, photo, and form intake | Meal plans, weekly menus, calorie dashboards, diet coaching |
| Parse + human correction | Generating new recipes from a craving |
| 9-view analysis, home and chef mode | Social feed, public SEO site |
| Save, rename, tag, reopen, delete | Multi-user household accounts as a goal |
| Shopping list + print | Vendor pricing, delivery, inventory |
| After-cook log | Automated model retraining from logs |
| Print station card / shopping list | Native iOS/Android apps |
| Simple account | Marketplace, paywall, chef endorsements |

### Users

| Persona | Job | Success |
|---|---|---|
| Curious home cook | Understand a card before changing it | Can say what each item does and when fenugreek goes in |
| Adapter | Cook tonight from an incomplete pantry | Knows structural vs skippable; prints only the gap |
| Recipe writer / teacher | Describe a dish without flattening the coast | View 5 names the family and the neighbours |
| Chef-mode cook | Get a briefing, not an essay | Cooks from the station card; finds no invented mise |

Michelin-trained cooks are a stress test, not the primary customer. Chef mode exists so their scrutiny does not require a second product.

---

## 10. How the product stands Michelin scrutiny

It will not stand that scrutiny if we ship folklore.

A starred kitchen grades whether you invent mise, whether you understand heat, and whether you would last on a line. Stars are given for ingredient quality, technique, harmony, personality, and consistency over time. This product can help a cook *think* toward those things. It cannot possess them.

**What fails in five minutes**

- Ghost garlic on this card
- Clock time instead of doneness
- Pillars as personality
- Tourism in View 5
- Hiding that the system cannot taste
- Silence on product quality, yield, and hold

**What can hold**

- No-invention rule
- Views 3 and 4 as the chef-facing core
- Public disagreement between views
- Inference in uniform (`INFERRED`, source named)
- Regional veto on View 5
- Chef mode that refuses more often
- Fields for product, control points, and hold

**Review gates**

- Week 4: one trained chef circles lies on ingest.
- Week 8: Kumari kuzhambu vs inland Tamil kuzhambu vs Kerala kudampuli curry — separable, zero invented ingredients.
- Week 12: cook from the station card, not from the essay.

The system may not certify deliciousness. Put on the product: *This analysis has not been tasted. Treat it as a briefing, then season.*

---

## 11. Data objects

| Object | Holds |
|---|---|
| Account | Auth, mode preference, optional restriction profile, label pack (US / EU) |
| Recipe | Title, tags, raw text, photo, structured ingredients, method, method source tag |
| Ingredient line | Display name, canonical name, amount, unit, group, confirmed sense, include-on-list, composition-table ID |
| Analysis | Mode, identification, nine view payloads, tags, created-at, snapshot-of |
| Shopping list | Recipe id, row states have/need, generated-at |
| Cook log | Recipe id, date, rating, notes, next-time, swaps, optional photo |
| Allergen map | Versioned curated table. Not prompt text |
| Food composition table | Versioned USDA (or peer) rows. Not model arithmetic |

Photo originals are stored. Analysis is stored or regenerated from the object plus a pinned prompt/model version so a saved briefing does not drift silently.

---

## 12. User stories

Priority: Must ships in the 12-week pilot. Should ships if Must is stable. Could waits for go / no-go.

### Epic A — Account

**A1 Must — Create an account**
As a cook, I want email/password (or existing SSO) so my recipes survive closing the browser.
- Register → empty library.
- Save while signed out → sign-in, then resume save.

**A2 Should — Guest session, then claim it**
As a first-time cook, I want to analyse one card before signing up.
- Guest can ingest and see analysis.
- Save migrates the current recipe onto a new account.

### Epic B — Intake

**B1 Must — Paste a recipe**
- Accepts mixed units, “to taste,” “as required,” vernacular names.
- Kanyakumari paste keeps two fenugreek lines.

**B2 Must — Photograph a recipe card**
- JPEG/PNG from phone or desktop.
- OCR draft visible before analysis.
- Golden fixture: Fish 500g, Drumstick 1, Mango 1/2, Half Shell coconut, both fenugreeks, no garlic.
- Low-confidence OCR lines flagged, not dropped.

**B3 Must — Review and correct the parse**
- Edit, add, delete, split, merge lines (split the wrapped chilli/coriander line).
- Mark non-ingredient headers.
- Corrected object is what analysis reads.

**B4 Must — Enter or attach a method**
- Method optional.
- If absent: analyse list-only, or accept a matched family method tagged INFERRED with source named.
- List-only → Views 3 and 7 INCOMPLETE.

**B5 Should — Structured form intake**
- Same object as paste and photo.
- Units include tsp, tbsp, g, kg, nos, to taste, as required, lemon size, half shell.

**B6 Should — Vernacular aliases**
- drumstick / murungakkai / moringa; shallots / chinna vengayam / cheriya ulli; fenugreek / methi / uluva / vendhayam; tamarind / puli; curry leaves / karuveppilai.
- Ambiguous “drumstick” asks for confirmation.

### Epic C — Analysis

**C1 Must — Identify the dish family**
- Family, one-line architecture, confidence, not-this neighbours, ABSENT family items.
- Golden fixture is not “generic Indian curry.”

**C2 Must — Run all views**
- All nine render, or a view is explicitly INCOMPLETE.
- No invented ingredients.
- Coriander in View 1; View 2 records the pillar blind spot.
- Two fenugreeks treated as two uses of one idea.

**C3 Must — Toggle home and chef mode**
- Default home. Chef leads with station card.
- Mode preference saved on the account.

**C4 Must — Claim tags and disagreements**
- CARD / METHOD / INFERRED / ABSENT / UNKNOWN / ASSUMED visible.
- Inferred method names its source.
- Disagreement module can show the coriander case.
- UNKNOWN fields stay blank.

**C5 Must — Station card**
- Generated when a method exists or an inferred method was accepted.
- Mise, sequence, do-nots, control points. Printable.

**C6 Should — Re-analyse after edit**
- Explicit re-run. Does not silently overwrite cook notes.

**C7 Could — Preview a substitution**
- One swap from View 4. States structural / modular / identity-shift. Does not invent a new recipe.

### Epic D — Save and library

**D1 Must — Save**
Stores raw input, photo, object, identification, analysis (or regenerate capability), timestamps. Default name is the family, editable.

**D2 Must — Browse and open**
Library shows name, date, family, whether a cook log exists.

**D3 Should — Tag and find**
Free-text tags. Search name, ingredients, tags.

**D4 Should — Edit a saved recipe**
Returns to parse review. Asks whether to re-analyse. Cook logs remain.

**D5 Should — Analysis snapshot**
On re-analyse, previous analysis is snapshotted and linked to existing logs. Last + current is enough for the pilot.

**D6 Must — Delete**
Confirm. Removes photo, object, analyses, lists, logs. No public residue.

### Epic E — Shopping list and print

**E1 Must — Generate a shopping list**
From the structured object, not from prose. One row per ingredient. “To taste” and “for tempering” stay visible. Two fenugreek rows. No headers.

**E2 Should — Tick off owned items**
Have / need. Print hides or strikes “have.” Persists on the saved recipe.

**E3 Should — Group the list**
Fresh produce, fish/meat, spices, fats/oils, other.

**E4 Must — Print the shopping list**
Black text, recipe name, date, grouped rows, checkboxes. One A4/Letter page for this card. No account chrome. Includes View 8 allergen line.

**E5 Must — Print the station card**
Separate from the list. Control points + “untasted briefing.” Readable at arm’s length. Allergen line included.

**E6 Could — Home-mode one-pager**
Keep / negotiate / identity-shift + ingredient list. Optional View 9 energy band. Not a legal nutrition label.

### Epic F — After-cook capture

**F1 Must — Log that I cooked it**
Date default today, editable. Multiple logs per recipe. Library shows last cooked.

**F2 Must — Rating and note**
1–5 optional + free text. Private. Visible on reopen, above the analysis.

**F3 Should — Record what I actually used**
Skipped / reduced / increased / swapped. Does not rewrite the card unless the user applies the swap.

**F4 Should — Next-time instruction**
Dedicated field. Shown on station card tagged COOK LOG, not CARD.

**F5 Could — Plate photo**
One image per log. Not re-analysed unless asked.

**F6 Must — Surface last-cook notes on reopen**
Last cooked date, rating, next-time line. Shopping list still reflects the saved card unless a swap was applied.

### Epic G — Quality

**G1 Must — Golden fixture in CI**
Both fenugreeks present; no ginger/garlic; family not generic curry; View 2 has coriander blind-spot note; chef mode has station card when inferred method accepted; View 8 flags fish + mustard, coconut not filed as US major tree nut, no “safe” language; View 9 is a band, sodium Unknown, no point-kcal.

**G2 Must — Regional veto on View 5**
Reviewer can block a live regional sentence. Pilot: one Tamil Nadu / Kanyakumari reviewer and one Kerala reviewer on the fish-curry cluster.

**G3 Must — Chef pass on three related curries**
Kumari / inland Tamil / Kerala kudampuli. Pass = identification differs, zero invented ingredients, station cards runnable, no “safe,” no point-kcal presented as fact.

### Epic H — Dietary profile (View 8)

**H1 Should — Household restriction profile**
Allergens, diet patterns, US or EU pack. Optional. Never auto-deletes recipes.

**H2 Must — Run View 8 on every analysis**
Golden mapping as in §6 View 8. Disclaimer visible.

**H3 Should — Highlight against profile**
Conflicts first. Unknown is not a pass.

**H4 Must — Print the allergen line**
On shopping list and station card.

**H5 Should — Log a restriction-driven swap**
Uses F3. Does not silently rewrite the card.

**H6 Must — Disclaimer inherited**
“Reads the card only. Does not test food. Does not know your kitchen. Not medical advice.”

**H7 Must — Versioned allergen mapping**
Curated tables. A mapping change is a reviewed data change.

### Epic I — Nutrition bands (View 9)

**I1 Must — Run View 9 as a band**
Golden fixture shows a range, not a point.

**I2 Must — Show and edit assumptions**
Fish class, coconut grams, oil tablespoons. Edit recomputes.

**I3 Should — Set portions**
Per-bowl band only after portions are set.

**I4 Should — Tighten the band**
Name fish / weigh coconut / measure oil.

**I5 Could — Optional energy band on the one-pager**
Never on the market list as if it were a packaged-food label.

**I6 Must — Disclaimer**
“Table estimate from stated assumptions. Not a lab analysis. Not medical advice.”

**I7 Must — Versioned food table**
USDA or peer IDs on mapped lines. Unmapped lines excluded from totals and listed.

---

## 13. Twelve-week delivery

Small team: project lead, ingest engineer, lens/interface engineer, culinary editor, two regional reviewers on contract, one designer.

| Weeks | Ships | Stories |
|---|---|---|
| 1–2 Spec and kitchen | Lens contracts frozen. 50-recipe fixture corpus started. Reviewers signed | Principles, G1 design |
| 3–4 Intake | Paste + photo + parse review on the golden card. Account | A1, B1–B4 |
| 5–6 Analysis core | Identification + Views 1–4. Home mode first | C1, C2 partial, C4 |
| 7–8 Analysis complete | Views 5–9, chef mode, station card, mode toggle | C2 rest, C3, C5, H2, I1, I2 |
| 9 Save + shop | Library, save, delete, shopping list, print list | D1 D2 D6, E1 E4, H4 |
| 10 Cook loop | Print station card, cook log, notes, header recall | E5, F1 F2 F6 |
| 11 Hardening | Aliases, tags, edit + re-analyse, profiles, assumption editors, reviewer veto | B6, D3–D5, F3 F4, H1 H3 H5, I3 I4, G2 |
| 12 Pilot gate | 20 people. Chef pass on three curries. Go / no-go | G3 |

Could-haves (C7, E6, F5, I5) only if Must on weeks 9–10 is stable.

---

## 14. Metrics and gates

A cook should leave able to answer:

1. What can I skip?
2. What happens if I skip it?
3. When does the finishing spice go in?
4. Can I shop from this?
5. Does my cook note come back tomorrow?

Quality gates: zero invented ingredients on the golden fixture; three related curries separable in chef mode; print list fits one page; photo-to-first-analysis under two minutes including parse correction; View 8 has no “safe”; View 9 has no point-kcal.

**Week 12 go:** Must stories work on the golden fixture and on twenty other messy recipes; View 5 not vetoed wholesale; cooks used save + list + log without coaching.

**No-go:** a beautiful analyser that cannot ingest a photograph, cannot shop, or cannot remember dinner.

---

## 15. End-to-end acceptance scene

Priya photographs the Deena’s Kitchen card.

She splits the wrapped chilli/coriander line. She confirms drumstick = moringa pod.

She has no method. The system offers CDK 1669 / Mrs. Anitha. She accepts. Tag: **INFERRED**.

Home mode explains the triple sour and the late fenugreek. She toggles chef mode and prints the station card. The card says: contains fish, mustard; also coconut, fenugreek (legume); species unknown; 1,300–2,200 kcal for the pot, sodium unknown; untasted briefing.

She ticks salt and coconut oil as have. Prints the rest. Drumstick and raw mango are on the paper.

She cooks. Fish holds. Five green chillies are too many.

She taps I cooked this, rates 4, writes next time: “2 green chillies, fenugreek powder off heat.”

Sunday she opens the saved recipe. The next-time line is at the top. Garlic is still absent. She prints a new list.

If any step needs a Slack message, a handmade PDF, or a retyped list, the story that should have covered it is not done.

---

## 16. Story index

| ID | Priority | Story |
|---|---|---|
| A1 | Must | Create an account |
| A2 | Should | Guest session, then claim it |
| B1 | Must | Paste a recipe |
| B2 | Must | Photograph a recipe card |
| B3 | Must | Review and correct the parse |
| B4 | Must | Enter or attach a method |
| B5 | Should | Structured form intake |
| B6 | Should | Vernacular aliases |
| C1 | Must | Identify the dish family |
| C2 | Must | Run all views |
| C3 | Must | Toggle home and chef mode |
| C4 | Must | Claim tags and disagreements |
| C5 | Must | Station card |
| C6 | Should | Re-analyse after edit |
| C7 | Could | Preview a substitution |
| D1 | Must | Save a recipe |
| D2 | Must | Browse and open library |
| D3 | Should | Tag and find |
| D4 | Should | Edit a saved recipe |
| D5 | Should | Analysis snapshot |
| D6 | Must | Delete a recipe |
| E1 | Must | Generate shopping list |
| E2 | Should | Tick off owned items |
| E3 | Should | Group list for market |
| E4 | Must | Print shopping list |
| E5 | Must | Print station card |
| E6 | Could | Print home-mode one-pager |
| F1 | Must | Log that I cooked it |
| F2 | Must | Rating and note |
| F3 | Should | Record swaps used |
| F4 | Should | Next-time instruction |
| F5 | Could | Plate photo |
| F6 | Must | Surface last-cook notes on reopen |
| G1 | Must | Golden fixture in CI |
| G2 | Must | Regional veto on View 5 |
| G3 | Must | Chef pass on three curries |
| H1 | Should | Household restriction profile |
| H2 | Must | Run View 8 |
| H3 | Should | Highlight profile conflicts |
| H4 | Must | Print allergen line |
| H5 | Should | Log restriction-driven swap |
| H6 | Must | View 8 disclaimer |
| H7 | Must | Versioned allergen mapping |
| I1 | Must | Run View 9 as a band |
| I2 | Must | Show and edit nutrition assumptions |
| I3 | Should | Set portions |
| I4 | Should | Tighten nutrition band |
| I5 | Could | Optional energy band on one-pager |
| I6 | Must | View 9 disclaimer |
| I7 | Must | Versioned food composition table |

---

## 17. Cook’s card (home-mode short form)

1. Grind raw coconut + dry spices.
2. Season that paste with tamarind and salt.
3. Add fish and veg. Short boil. Do not wreck the fish.
4. Fenugreek powder + pepper at the end.
5. Coconut-oil tadka last. Cover once.

Keep: coconut body, some sour, fenugreek, curry-leaf coconut oil.
Negotiate: drumstick, tomato, chilli count, fish variety.
Do not “fix” it by roasting the coconut or simmering it like mutton.

---

The product is not nine views in the abstract. The product is a recipe that can be entered, understood, saved, shopped, cooked, and corrected — without inventing a single shallot that was not on the card.
