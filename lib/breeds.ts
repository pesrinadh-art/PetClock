// Curated, non-exhaustive list of common dog and cat breeds for the breed-field typeahead.
// Plain data module (no React). Breed is free-form: this list only powers suggestions —
// callers must still accept arbitrary typed text.

export type BreedSpecies = 'dog' | 'cat';

export type Breed = {
  name: string;
  species: BreedSpecies;
};

const DOG_BREEDS: string[] = [
  'Affenpinscher',
  'Airedale Terrier',
  'Akita',
  'Alaskan Malamute',
  'American Bulldog',
  'American Pit Bull Terrier',
  'Australian Cattle Dog',
  'Australian Shepherd',
  'Basenji',
  'Basset Hound',
  'Beagle',
  'Bernese Mountain Dog',
  'Bichon Frise',
  'Bloodhound',
  'Border Collie',
  'Border Terrier',
  'Boston Terrier',
  'Boxer',
  'Brittany',
  'Bull Terrier',
  'Bulldog',
  'Cane Corso',
  'Cavalier King Charles Spaniel',
  'Chihuahua',
  'Chow Chow',
  'Cocker Spaniel',
  'Collie',
  'Corgi',
  'Dachshund',
  'Dalmatian',
  'Doberman Pinscher',
  'English Setter',
  'English Springer Spaniel',
  'French Bulldog',
  'German Shepherd',
  'German Shorthaired Pointer',
  'Golden Retriever',
  'Great Dane',
  'Great Pyrenees',
  'Greyhound',
  'Havanese',
  'Irish Setter',
  'Irish Wolfhound',
  'Jack Russell Terrier',
  'Labrador Retriever',
  'Lhasa Apso',
  'Maltese',
  'Mastiff',
  'Miniature Schnauzer',
  'Newfoundland',
  'Papillon',
  'Pekingese',
  'Pembroke Welsh Corgi',
  'Pointer',
  'Pomeranian',
  'Poodle',
  'Portuguese Water Dog',
  'Pug',
  'Rat Terrier',
  'Rhodesian Ridgeback',
  'Rottweiler',
  'Saint Bernard',
  'Samoyed',
  'Schnauzer',
  'Scottish Terrier',
  'Shar Pei',
  'Shetland Sheepdog',
  'Shiba Inu',
  'Shih Tzu',
  'Siberian Husky',
  'Staffordshire Bull Terrier',
  'Vizsla',
  'Weimaraner',
  'West Highland White Terrier',
  'Whippet',
  'Yorkshire Terrier',
];

const CAT_BREEDS: string[] = [
  'Abyssinian',
  'American Shorthair',
  'Balinese',
  'Bengal',
  'Birman',
  'Bombay',
  'British Shorthair',
  'Burmese',
  'Chartreux',
  'Cornish Rex',
  'Devon Rex',
  'Domestic Longhair',
  'Domestic Shorthair',
  'Egyptian Mau',
  'Exotic Shorthair',
  'Himalayan',
  'Maine Coon',
  'Manx',
  'Norwegian Forest Cat',
  'Ocicat',
  'Oriental Shorthair',
  'Persian',
  'Ragamuffin',
  'Ragdoll',
  'Russian Blue',
  'Savannah',
  'Scottish Fold',
  'Siamese',
  'Siberian',
  'Sphynx',
  'Tonkinese',
  'Turkish Angora',
  'Turkish Van',
];

export const BREEDS: readonly Breed[] = [
  ...DOG_BREEDS.map((name): Breed => ({ name, species: 'dog' })),
  ...CAT_BREEDS.map((name): Breed => ({ name, species: 'cat' })),
];

/**
 * Case-insensitive breed suggestions. Prefix matches rank above substring matches; ties keep
 * alphabetical order. When `species` is given, only that species is searched. Returns at most
 * `limit` names. An empty/whitespace query returns [] so the dropdown stays hidden.
 */
export function suggestBreeds(query: string, species?: BreedSpecies, limit = 6): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const pool = species ? BREEDS.filter((b) => b.species === species) : BREEDS;

  const prefix: string[] = [];
  const substring: string[] = [];
  for (const { name } of pool) {
    const lower = name.toLowerCase();
    if (lower === q) continue; // no point suggesting the exact value already typed
    if (lower.startsWith(q)) prefix.push(name);
    else if (lower.includes(q)) substring.push(name);
  }
  return [...prefix, ...substring].slice(0, limit);
}
