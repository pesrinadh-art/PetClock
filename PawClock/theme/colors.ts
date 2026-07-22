export const colors = {
  sage: '#4A7C59',
  sageLight: '#7BAE8A',
  sagePale: '#EAF2EC',
  pee: '#F5C842',
  poo: '#A0522D',
  pooLight: '#C4845A',
  food: '#E8734A',
  foodLight: '#FEF0EB',
  apptVet: '#5B8DD9',
  apptVetLight: '#EBF1FB',
  apptGroom: '#9B6BB5',
  apptGroomLight: '#F3EEF8',
  apptVaccine: '#2AABA0',
  apptVaccineLight: '#E6F6F5',
  apptOther: '#7A7268',
  apptOtherLight: '#F0EFED',
  medicine: '#8E63B8',
  medicineLight: '#F1EAF7',
  cream: '#FDFAF5',
  stone: '#3D3830',
  stoneMid: '#7A7268',
  stoneLight: '#C8C3BA',
  white: '#FFFFFF',
  background: '#E8E2D9',
} as const;

export const radius = {
  lg: 20,
  sm: 12,
};

export const shadow = {
  card: {
    shadowColor: colors.stone,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 3,
  },
  sm: {
    shadowColor: colors.stone,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
};
