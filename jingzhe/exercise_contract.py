"""Load the exercise display and processing contract from one JSON source."""

import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = PROJECT_ROOT / 'data/jingzhe/exercise.json'

with CONTRACT_PATH.open('r', encoding='utf-8') as contract_file:
    EXERCISE_CONTRACT = json.load(contract_file)

SPORTS = EXERCISE_CONTRACT['sports']
GROUPS = EXERCISE_CONTRACT['groups']

SPORT_NAMES = {sport: values['name'] for sport, values in SPORTS.items()}
SPORT_COLORS = {sport: values['color'] for sport, values in SPORTS.items()}
ACTIVITY_TYPE_CN = dict(SPORT_NAMES)
ACTIVITY_DISTANCE_VERBS = {
    sport: values['distanceVerb']
    for sport, values in SPORTS.items()
    if values.get('distanceVerb')
}
ACTIVITY_DISTANCE_GROUPS = {
    sport: values['distanceGroup']
    for sport, values in SPORTS.items()
    if values.get('distanceGroup')
}

RIDE_TYPES = set(GROUPS['ride'])
RUN_WALK_TYPES = set(GROUPS['summaryRunWalk'])
DISPLAY_RUN_WALK_TYPES = set(GROUPS['displayRunWalk'])

FOOD_EQUIVALENTS = [
    {key: value for key, value in food.items() if key != 'monthly'}
    for food in EXERCISE_CONTRACT['foods']
]
MONTHLY_FOOD_EQUIVALENTS = [
    {key: value for key, value in food.items() if key != 'monthly'}
    for food in EXERCISE_CONTRACT['foods']
    if food.get('monthly')
]
