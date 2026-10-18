import os
import unittest
from unittest.mock import patch
from function_env import version_environment


class FunctionEnvironmentTest(unittest.TestCase):
    def resolve(self, deploy, current=None, status=200):
        def request(method, url, token):
            self.assertEqual(method, "GET")
            self.assertIn("tag=%24latest", url)
            return status, {"environment": current or {}}
        with patch.dict(os.environ, deploy, clear=True):
            return version_environment("unused", "function", request, {})

    def test_preserve_and_override(self):
        current = dict(JWT_SECRET="test-current", JWT_SECRET_PREVIOUS="test-old",
                       ANALYTICS_ADMIN_KEY="test-admin", OTHER="keep")
        result = self.resolve({"JWT_SECRET": "", "JWT_SECRET_PREVIOUS": ""}, current)
        self.assertEqual(result, {**current, "CORS_ORIGIN": "https://paulos99.github.io",
                                 "ANALYTICS_KEY": "analytics-events.json", "PLATFORM_KEY": "platform-v2.json"})
        result = self.resolve({"JWT_SECRET": "test-new", "CORS_ORIGIN": "http://localhost:5173"}, current)
        self.assertEqual(result["JWT_SECRET"], "test-new")
        self.assertEqual(result["CORS_ORIGIN"], "http://localhost:5173")
        result = self.resolve({"JWT_SECRET_PREVIOUS_CLEAR": "true"}, current)
        self.assertNotIn("JWT_SECRET_PREVIOUS", result)

    def test_initial_deploy_and_fail_closed(self):
        values = dict(JWT_SECRET="test-current", ANALYTICS_ADMIN_KEY="test-admin")
        self.assertNotIn("JWT_SECRET_PREVIOUS", self.resolve(values, status=404))
        for missing in values:
            with self.assertRaisesRegex(SystemExit, missing):
                self.resolve({k: v for k, v in values.items() if k != missing}, status=404)
        with self.assertRaisesRegex(SystemExit, "HTTP 403"):
            self.resolve(values, status=403)
        with self.assertRaisesRegex(SystemExit, "Remove JWT_SECRET_PREVIOUS"):
            self.resolve({**values, "JWT_SECRET_PREVIOUS": "test-old", "JWT_SECRET_PREVIOUS_CLEAR": "true"})


if __name__ == "__main__":
    unittest.main()
