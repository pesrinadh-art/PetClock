/**
 * Boundary clean-up (docs/CARE_MODULES_PLAN.md, "Guardrails" 1): the helpers screens now call
 * instead of reading `.species` must produce exactly the wording/lists they produced before.
 */
import { pottyPhraseForPet } from '../care/species';
import { pottyBreakPhrase } from '../petVoice';
import { breedSpeciesKey, suggestBreeds } from '../breeds';

const SPECIES = ['dog', 'cat', 'rabbit', 'hamster', 'bird', 'fish', 'turtle', 'snake', 'other', 'unicorn'];

describe('pottyPhraseForPet', () => {
  it.each(SPECIES)('matches pottyBreakPhrase for %s', (species) => {
    expect(pottyPhraseForPet({ species })).toBe(pottyBreakPhrase(species));
  });

  it('keeps today\'s wording', () => {
    expect(pottyPhraseForPet({ species: 'dog' })).toBe('potty walk');
    expect(pottyPhraseForPet({ species: 'cat' })).toBe('litter box trip');
    expect(pottyPhraseForPet({ species: 'rabbit' })).toBe('litter box trip');
    expect(pottyPhraseForPet({ species: 'hamster' })).toBe('potty break');
    expect(pottyPhraseForPet(null)).toBe('potty break');
    expect(pottyPhraseForPet(undefined)).toBe('potty break');
  });
});

describe('breedSpeciesKey', () => {
  it('maps tags and human labels to the dog/cat lists', () => {
    expect(breedSpeciesKey('dog')).toBe('dog');
    expect(breedSpeciesKey('Dog')).toBe('dog');
    expect(breedSpeciesKey(' Cat ')).toBe('cat');
  });

  it('searches all breeds for anything else', () => {
    expect(breedSpeciesKey('Rabbit')).toBeUndefined();
    expect(breedSpeciesKey('')).toBeUndefined();
    expect(breedSpeciesKey(undefined)).toBeUndefined();
    expect(breedSpeciesKey(null)).toBeUndefined();
  });

  it('feeds suggestBreeds the same key as before', () => {
    expect(suggestBreeds('bea', breedSpeciesKey('Dog'))).toEqual(suggestBreeds('bea', 'dog'));
    expect(suggestBreeds('bea', breedSpeciesKey('Rabbit'))).toEqual(suggestBreeds('bea', undefined));
  });
});
