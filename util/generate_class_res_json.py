with open('ids.txt', 'r') as f:
    ids = f.readlines()

ids = [id.strip() for id in ids]

array = ['{"parcel_id":' + id + ',"classification_results":{"first_rank":{"crop_id":110,"probability":0.8},"second_rank":{"crop_id":715,"probability":0.13},"third_rank":{"crop_id":771,"probability":0.05}}}'
for id in ids]

with open('classification_results.json', 'w') as f:
    f.write('[' + ','.join(array) + ']')
