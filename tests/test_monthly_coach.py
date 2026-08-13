import json
import os
import tempfile
import unittest
from datetime import datetime
from unittest.mock import patch

import monthly_coach


def activity(date, distance=10, sport='Ride'):
    return {
        'start_date_local': date,
        'type': sport,
        'distance': distance,
        'moving_time': '00:30:00',
        'calories': 300,
        'average_heartrate': 110,
        'total_elevation_gain': 50,
        'is_indoor': False,
        'route_group_id': 'private-route-id',
        'summary_polyline': 'private-polyline',
        'source_id': 'private-source-id'
    }


def report_for(facts):
    return {
        'verdict': '本阶段共有10次运动，出勤和单次耐力形成了一条清晰主线。',
        'analysis': (
            '累计距离与单次距离共同变化，重复路线又提供了相近条件下的观察基础。'
            '现有样本足以描述运动安排，但不能据此判断身体恢复或实际减重。'
        ),
        'next_plan': (
            '下一阶段保留骑行为主线，安排三次相近距离记录，并用完成次数、'
            '典型节奏与平均心率能否复现作为检查标准。'
        ),
        'evidence_ids': [item['id'] for item in facts['evidence'][:3]]
    }


class MonthlyCoachStateTests(unittest.TestCase):
    def setUp(self):
        self.activities = []
        for month in (7, 8):
            for day in (1, 3, 5, 7, 9, 11, 13, 16, 20, 24):
                self.activities.append(activity(f'2026-{month:02d}-{day:02d}T19:00:00', 10 + day / 10))
        handle, self.path = tempfile.mkstemp(suffix='.json')
        os.close(handle)
        with open(self.path, 'w', encoding='utf-8') as file:
            json.dump({}, file)

    def tearDown(self):
        os.unlink(self.path)

    def read(self):
        with open(self.path, 'r', encoding='utf-8') as file:
            return json.load(file)

    @patch('monthly_coach.generate_report', side_effect=lambda _key, facts: report_for(facts))
    def test_accumulating_midmonth_freeze_and_final_transition(self, generate):
        monthly_coach.update_monthly_insights(
            self.activities,
            self.path,
            api_key='test-key',
            now=datetime(2026, 8, 13, 12),
            finalize_closed_months=True
        )
        data = self.read()
        self.assertEqual('accumulating', data['2026-08']['report_phase'])

        generate.reset_mock()
        monthly_coach.update_monthly_insights(
            self.activities,
            self.path,
            api_key='test-key',
            now=datetime(2026, 8, 15, 12)
        )
        before_window = self.read()['2026-08']
        self.assertEqual('accumulating', before_window['report_phase'])
        generate.assert_not_called()

        monthly_coach.update_monthly_insights(
            self.activities,
            self.path,
            api_key='test-key',
            now=datetime(2026, 8, 16, 4)
        )
        normal_sync = self.read()['2026-08']
        self.assertEqual('accumulating', normal_sync['report_phase'])
        generate.assert_not_called()

        monthly_coach.update_monthly_insights(
            self.activities,
            self.path,
            api_key='test-key',
            now=datetime(2026, 8, 16, 4),
            generate_midmonth=True
        )
        midmonth = self.read()['2026-08']
        self.assertEqual('midmonth', midmonth['report_phase'])
        self.assertEqual(1, generate.call_count)
        frozen_as_of = midmonth['report_as_of']

        generate.reset_mock()
        expanded = self.activities + [activity('2026-08-25T19:00:00')]
        monthly_coach.update_monthly_insights(
            expanded,
            self.path,
            api_key='test-key',
            now=datetime(2026, 8, 25, 20)
        )
        frozen = self.read()['2026-08']
        self.assertEqual(frozen_as_of, frozen['report_as_of'])
        generate.assert_not_called()

        monthly_coach.update_monthly_insights(
            expanded,
            self.path,
            api_key='test-key',
            now=datetime(2026, 9, 1, 12)
        )
        still_midmonth = self.read()['2026-08']
        self.assertEqual('midmonth', still_midmonth['report_phase'])
        generate.assert_not_called()

        monthly_coach.update_monthly_insights(
            expanded,
            self.path,
            api_key='test-key',
            now=datetime(2026, 9, 1, 4),
            finalize_closed_months=True
        )
        final = self.read()['2026-08']
        self.assertEqual('final', final['report_phase'])
        self.assertEqual(1, generate.call_count)

    @patch('monthly_coach.generate_report', side_effect=lambda _key, facts: report_for(facts))
    def test_midmonth_requires_both_session_and_active_day_thresholds(self, generate):
        five_sessions = [
            activity(f'2026-08-{day:02d}T19:00:00')
            for day in (1, 3, 5, 7, 9)
        ]
        monthly_coach.update_monthly_insights(
            five_sessions,
            self.path,
            api_key='test-key',
            now=datetime(2026, 8, 16, 4),
            generate_midmonth=True
        )
        self.assertEqual('本月样本尚少，继续积累中', self.read()['2026-08']['status_text'])
        generate.assert_not_called()

        six_sessions_four_days = [
            activity('2026-08-01T08:00:00'),
            activity('2026-08-01T19:00:00'),
            activity('2026-08-03T08:00:00'),
            activity('2026-08-03T19:00:00'),
            activity('2026-08-05T19:00:00'),
            activity('2026-08-07T19:00:00')
        ]
        monthly_coach.update_monthly_insights(
            six_sessions_four_days,
            self.path,
            api_key='test-key',
            now=datetime(2026, 8, 16, 4),
            generate_midmonth=True
        )
        self.assertEqual('本月样本尚少，继续积累中', self.read()['2026-08']['status_text'])
        generate.assert_not_called()

    def test_deepseek_facts_do_not_contain_activity_identity_or_track(self):
        current = monthly_coach.calculate_monthly_stats(
            [item for item in self.activities if item['start_date_local'].startswith('2026-08')]
        )
        previous = monthly_coach.calculate_monthly_stats(
            [item for item in self.activities if item['start_date_local'].startswith('2026-07')]
        )
        facts = monthly_coach.build_evidence(
            '2026-08', 'final', current, previous, previous, 31
        )
        serialized = json.dumps(facts, ensure_ascii=False)
        self.assertNotIn('private-route-id', serialized)
        self.assertNotIn('private-polyline', serialized)
        self.assertNotIn('private-source-id', serialized)
        self.assertNotIn('summary_polyline', serialized)

    @patch('monthly_coach.request_deepseek_report')
    def test_saved_report_drops_unexpected_uncertainty_field(self, request):
        current = monthly_coach.calculate_monthly_stats(
            [item for item in self.activities if item['start_date_local'].startswith('2026-08')]
        )
        previous = monthly_coach.calculate_monthly_stats(
            [item for item in self.activities if item['start_date_local'].startswith('2026-07')]
        )
        facts = monthly_coach.build_evidence(
            '2026-08', 'final', current, previous, previous, 31
        )
        candidate = report_for(facts)
        candidate['analysis'] += (
            '本阶段的出勤密度、重复路线和单次距离可以互相解释，'
            '因此下一阶段能够用同一组记录继续验证，而不是只看累计数字。'
        )
        candidate['uncertainty'] = '这段内容不应进入最终 JSON。'
        request.return_value = candidate
        result = monthly_coach.generate_report('test-key', facts)
        self.assertNotIn('uncertainty', result)


if __name__ == '__main__':
    unittest.main()
