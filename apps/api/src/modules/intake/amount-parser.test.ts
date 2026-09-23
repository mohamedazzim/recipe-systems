import { parseAmountAndUnit, extractAmountFromDisplayName, extractServings } from './amount-parser';

describe('amount-parser', () => {
  describe('parseAmountAndUnit', () => {
    it('handles empty or null inputs', () => {
      expect(parseAmountAndUnit(null)).toEqual({ amount: null, unit: null });
      expect(parseAmountAndUnit(undefined)).toEqual({ amount: null, unit: null });
      expect(parseAmountAndUnit('')).toEqual({ amount: null, unit: null });
      expect(parseAmountAndUnit('   ')).toEqual({ amount: null, unit: null });
    });

    it('handles qualitative / imprecise amounts', () => {
      expect(parseAmountAndUnit('to taste')).toEqual({ amount: null, unit: null });
      expect(parseAmountAndUnit('to-taste')).toEqual({ amount: null, unit: null });
      expect(parseAmountAndUnit('as required')).toEqual({ amount: null, unit: null });
      expect(parseAmountAndUnit('as needed')).toEqual({ amount: null, unit: null });
      expect(parseAmountAndUnit('half shell')).toEqual({ amount: null, unit: null });
      expect(parseAmountAndUnit('a lemon size')).toEqual({ amount: null, unit: null });
      expect(parseAmountAndUnit('for tempering')).toEqual({ amount: null, unit: null });
      expect(parseAmountAndUnit('for frying')).toEqual({ amount: null, unit: null });
    });

    it('parses whole numbers and units', () => {
      expect(parseAmountAndUnit('1 cup')).toEqual({ amount: 1, unit: 'cup' });
      expect(parseAmountAndUnit('3 cups')).toEqual({ amount: 3, unit: 'cup' });
      expect(parseAmountAndUnit('4')).toEqual({ amount: 4, unit: null });
      expect(parseAmountAndUnit('2 sprigs')).toEqual({ amount: 2, unit: 'sprig' });
      expect(parseAmountAndUnit('4 nos')).toEqual({ amount: 4, unit: 'nos' });
      expect(parseAmountAndUnit('4 Nos')).toEqual({ amount: 4, unit: 'nos' });
      expect(parseAmountAndUnit('1 tbsp')).toEqual({ amount: 1, unit: 'tbsp' });
      expect(parseAmountAndUnit('2 tablespoons')).toEqual({ amount: 2, unit: 'tbsp' });
      expect(parseAmountAndUnit('1 inch')).toEqual({ amount: 1, unit: 'inch' });
    });

    it('parses attached units without space', () => {
      expect(parseAmountAndUnit('500g')).toEqual({ amount: 500, unit: 'g' });
      expect(parseAmountAndUnit('1kg')).toEqual({ amount: 1, unit: 'kg' });
      expect(parseAmountAndUnit('1/4tsp')).toEqual({ amount: 0.25, unit: 'tsp' });
      expect(parseAmountAndUnit('500gm')).toEqual({ amount: 500, unit: 'g' });
    });

    it('parses fractions', () => {
      expect(parseAmountAndUnit('1/4 tsp')).toEqual({ amount: 0.25, unit: 'tsp' });
      expect(parseAmountAndUnit('1/2 tsp')).toEqual({ amount: 0.5, unit: 'tsp' });
      expect(parseAmountAndUnit('3/4 cup')).toEqual({ amount: 0.75, unit: 'cup' });
      expect(parseAmountAndUnit('1/8')).toEqual({ amount: 0.125, unit: null });
      expect(parseAmountAndUnit('1/3 cup')).toEqual({ amount: 0.3333, unit: 'cup' });
    });

    it('parses mixed fractions', () => {
      expect(parseAmountAndUnit('1 1/2 cups')).toEqual({ amount: 1.5, unit: 'cup' });
      expect(parseAmountAndUnit('1-1/2 cup')).toEqual({ amount: 1.5, unit: 'cup' });
      expect(parseAmountAndUnit('2 1/4 tsp')).toEqual({ amount: 2.25, unit: 'tsp' });
    });

    it('parses unicode vulgar fractions', () => {
      expect(parseAmountAndUnit('½ cup')).toEqual({ amount: 0.5, unit: 'cup' });
      expect(parseAmountAndUnit('¼ tsp')).toEqual({ amount: 0.25, unit: 'tsp' });
      expect(parseAmountAndUnit('1½ cups')).toEqual({ amount: 1.5, unit: 'cup' });
      expect(parseAmountAndUnit('2¾ tbsp')).toEqual({ amount: 2.75, unit: 'tbsp' });
    });

    it('parses decimals and ranges', () => {
      expect(parseAmountAndUnit('0.5 kg')).toEqual({ amount: 0.5, unit: 'kg' });
      expect(parseAmountAndUnit('1.25 l')).toEqual({ amount: 1.25, unit: 'l' });
      expect(parseAmountAndUnit('1-2 cups')).toEqual({ amount: 1.5, unit: 'cup' });
      expect(parseAmountAndUnit('2 to 3 tbsp')).toEqual({ amount: 2.5, unit: 'tbsp' });
      expect(parseAmountAndUnit('10 - 12 nos')).toEqual({ amount: 11, unit: 'nos' });
    });

    it('parses word numbers', () => {
      expect(parseAmountAndUnit('one cup')).toEqual({ amount: 1, unit: 'cup' });
      expect(parseAmountAndUnit('half cup')).toEqual({ amount: 0.5, unit: 'cup' });
      expect(parseAmountAndUnit('two sprigs')).toEqual({ amount: 2, unit: 'sprig' });
    });

    it('strips parenthetical qualifiers and trailing notes', () => {
      expect(parseAmountAndUnit('1 cup (grated)')).toEqual({ amount: 1, unit: 'cup' });
      expect(parseAmountAndUnit('3 cups (warm)')).toEqual({ amount: 3, unit: 'cup' });
      expect(parseAmountAndUnit('4, sliced')).toEqual({ amount: 4, unit: null });
      expect(parseAmountAndUnit('1 tbsp, melted')).toEqual({ amount: 1, unit: 'tbsp' });
    });

    it('matches Parippu Curry sample ingredients perfectly', () => {
      expect(parseAmountAndUnit('1 cup')).toEqual({ amount: 1, unit: 'cup' });
      expect(parseAmountAndUnit('3 cups')).toEqual({ amount: 3, unit: 'cup' });
      expect(parseAmountAndUnit('1/4 tsp')).toEqual({ amount: 0.25, unit: 'tsp' });
      expect(parseAmountAndUnit('to taste')).toEqual({ amount: null, unit: null });
      expect(parseAmountAndUnit('1 tbsp')).toEqual({ amount: 1, unit: 'tbsp' });
      expect(parseAmountAndUnit('4')).toEqual({ amount: 4, unit: null });
      expect(parseAmountAndUnit('1/2 tsp')).toEqual({ amount: 0.5, unit: 'tsp' });
      expect(parseAmountAndUnit('2 sprigs')).toEqual({ amount: 2, unit: 'sprig' });
      expect(parseAmountAndUnit('2')).toEqual({ amount: 2, unit: null });
    });
  });

  describe('extractAmountFromDisplayName', () => {
    it('extracts trailing amounts after em-dash, en-dash, or hyphen', () => {
      expect(extractAmountFromDisplayName('Fish — 500g')).toBe('500g');
      expect(extractAmountFromDisplayName('Fenugreek Powder — 1/2 Tsp')).toBe('1/2 Tsp');
      expect(extractAmountFromDisplayName('Salt - to taste')).toBe('to taste');
      expect(extractAmountFromDisplayName('Curry leaves — 2 sprigs')).toBe('2 sprigs');
    });

    it('returns null if no separator or not an amount', () => {
      expect(extractAmountFromDisplayName('Dal split green gram')).toBeNull();
      expect(extractAmountFromDisplayName('Pre-cooked dal')).toBeNull();
      expect(extractAmountFromDisplayName('Stir-fry')).toBeNull();
    });

    it('does not let a hyphen inside the name hide the real em-dash separator', () => {
      expect(extractAmountFromDisplayName('Mutton, bone-in — 150 g')).toBe('150 g');
      expect(extractAmountFromDisplayName('Bone-in mutton - 150 g')).toBe('150 g');
      expect(extractAmountFromDisplayName('Omega-3 fish oil — 100 g')).toBe('100 g');
    });

    it('never treats a numeric range ("1-2 hours") as a name/amount separator', () => {
      expect(extractAmountFromDisplayName('Cook 1-2 hours, low heat.')).toBeNull();
    });
  });

  describe('extractServings', () => {
    it('detects the common servings wordings', () => {
      expect(extractServings('Meen Kuzhambu\nServes 4')).toBe(4);
      expect(extractServings('Serves: 4 people')).toBe(4);
      expect(extractServings('A simple dal. 4 servings.')).toBe(4);
      expect(extractServings('Yield 6')).toBe(6);
      expect(extractServings('Makes 4')).toBe(4);
      expect(extractServings('2 portions')).toBe(2);
    });

    it('returns null when the source is silent', () => {
      expect(extractServings('Meen Kuzhambu\nFish 500g')).toBeNull();
      expect(extractServings(null)).toBeNull();
      expect(extractServings(undefined)).toBeNull();
      expect(extractServings('')).toBeNull();
    });

    it('ignores unrelated numbers (amounts are not servings)', () => {
      expect(extractServings('500g fish\n1 tsp salt')).toBeNull();
    });
  });
});
