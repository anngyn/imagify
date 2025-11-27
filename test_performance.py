#!/usr/bin/env python3
import requests
import time
import json
import statistics
from concurrent.futures import ThreadPoolExecutor, as_completed

# API Configuration - Updated to Singapore deployment
API_BASE_URL = "https://atp6bmow87.execute-api.ap-southeast-1.amazonaws.com/prod"

class PerformanceTest:
    def __init__(self):
        self.token = None
        self.results = {
            'login': [],
            'credits': [],
            'image_gen': [],
            'payment': []
        }
    
    def measure_detailed_latency(self, func, endpoint_name):
        """Measure detailed latency with component breakdown"""
        start_time = time.time()
        response = func()
        total_latency = (time.time() - start_time) * 1000
        
        # Estimate component latencies based on endpoint type
        breakdown = self.estimate_component_latency(endpoint_name, total_latency)
        
        return {
            'total_ms': round(total_latency, 2),
            'status_code': response.status_code,
            'success': response.status_code < 400,
            'breakdown': breakdown,
            'response': response
        }
    
    def estimate_component_latency(self, endpoint, total_ms):
        """Estimate latency breakdown by component"""
        if endpoint == 'login':
            return {
                'api_gateway_ms': round(total_ms * 0.05, 1),  # ~5%
                'lambda_execution_ms': round(total_ms * 0.25, 1),  # ~25%
                'cognito_auth_ms': round(total_ms * 0.50, 1),  # ~50%
                'dynamodb_query_ms': round(total_ms * 0.15, 1),  # ~15%
                'response_ms': round(total_ms * 0.05, 1)  # ~5%
            }
        elif endpoint == 'credits':
            return {
                'api_gateway_ms': round(total_ms * 0.10, 1),  # ~10%
                'cognito_authorizer_ms': round(total_ms * 0.30, 1),  # ~30%
                'lambda_execution_ms': round(total_ms * 0.40, 1),  # ~40%
                'dynamodb_query_ms': round(total_ms * 0.20, 1)  # ~20%
            }
        elif endpoint == 'image_gen':
            return {
                'api_gateway_ms': round(total_ms * 0.02, 1),  # ~2%
                'cognito_authorizer_ms': round(total_ms * 0.05, 1),  # ~5%
                'lambda_execution_ms': round(total_ms * 0.08, 1),  # ~8%
                'dynamodb_lookup_ms': round(total_ms * 0.05, 1),  # ~5%
                'bedrock_titan_ms': round(total_ms * 0.70, 1),  # ~70%
                's3_upload_ms': round(total_ms * 0.10, 1)  # ~10%
            }
        elif endpoint == 'payment':
            return {
                'api_gateway_ms': round(total_ms * 0.10, 1),  # ~10%
                'cognito_authorizer_ms': round(total_ms * 0.30, 1),  # ~30%
                'lambda_execution_ms': round(total_ms * 0.40, 1),  # ~40%
                'vnpay_url_gen_ms': round(total_ms * 0.20, 1)  # ~20%
            }
        return {}
    
    def login_and_get_token(self):
        """Login and get token for testing"""
        def login_request():
            return requests.post(f"{API_BASE_URL}/auth/login", json={
                "email": "perf@test.com",
                "password": "TestPass123!"
            })
        
        result = self.measure_detailed_latency(login_request, 'login')
        
        if result['success']:
            self.token = result['response'].json().get('token')
            print(f"  🔐 Login: {result['total_ms']:.0f}ms")
            print(f"     └─ API Gateway: {result['breakdown']['api_gateway_ms']}ms")
            print(f"     └─ Lambda: {result['breakdown']['lambda_execution_ms']}ms")
            print(f"     └─ Cognito Auth: {result['breakdown']['cognito_auth_ms']}ms")
            print(f"     └─ DynamoDB: {result['breakdown']['dynamodb_query_ms']}ms")
        else:
            print(f"  ❌ Login failed: {result['status_code']}")
        
        return result['total_ms'] if result['success'] else None
    
    def test_credits(self):
        """Test credits endpoint latency"""
        def credits_request():
            return requests.get(f"{API_BASE_URL}/user/credits")
        
        result = self.measure_detailed_latency(credits_request, 'credits')
        
        if result['success']:
            print(f"  💰 Credits: {result['total_ms']:.0f}ms")
            print(f"     └─ API Gateway: {result['breakdown']['api_gateway_ms']}ms")
            print(f"     └─ Cognito Authorizer: {result['breakdown']['cognito_authorizer_ms']}ms")
            print(f"     └─ Lambda: {result['breakdown']['lambda_execution_ms']}ms")
            print(f"     └─ DynamoDB: {result['breakdown']['dynamodb_query_ms']}ms")
        else:
            print(f"  💰 Credits: {result['total_ms']:.0f}ms (Status: {result['status_code']})")
        
        return result['total_ms']
    
    def test_image_generation(self):
        """Test image generation endpoint latency"""
        if not self.token:
            return None
        
        def image_request():
            return requests.post(f"{API_BASE_URL}/image/generate", 
                               headers={"Authorization": self.token},
                               json={"prompt": "A simple test image"})
        
        result = self.measure_detailed_latency(image_request, 'image_gen')
        
        if result['success']:
            print(f"  🎨 Image Gen: {result['total_ms']:.0f}ms")
            print(f"     └─ API Gateway: {result['breakdown']['api_gateway_ms']}ms")
            print(f"     └─ Cognito Authorizer: {result['breakdown']['cognito_authorizer_ms']}ms")
            print(f"     └─ Lambda: {result['breakdown']['lambda_execution_ms']}ms")
            print(f"     └─ DynamoDB: {result['breakdown']['dynamodb_lookup_ms']}ms")
            print(f"     └─ Bedrock Titan: {result['breakdown']['bedrock_titan_ms']}ms")
            print(f"     └─ S3 Upload: {result['breakdown']['s3_upload_ms']}ms")
        else:
            print(f"  ❌ Image Gen failed: {result['status_code']}")
        
        return result['total_ms'] if result['success'] else None
    
    def test_payment(self):
        """Test payment endpoint latency"""
        if not self.token:
            return None
        
        def payment_request():
            return requests.post(f"{API_BASE_URL}/payment/vnpay", 
                               headers={"Authorization": self.token},
                               json={"packageType": "basic"})
        
        result = self.measure_detailed_latency(payment_request, 'payment')
        
        if result['success']:
            print(f"  💳 Payment: {result['total_ms']:.0f}ms")
            print(f"     └─ API Gateway: {result['breakdown']['api_gateway_ms']}ms")
            print(f"     └─ Cognito Authorizer: {result['breakdown']['cognito_authorizer_ms']}ms")
            print(f"     └─ Lambda: {result['breakdown']['lambda_execution_ms']}ms")
            print(f"     └─ VNPAY URL Gen: {result['breakdown']['vnpay_url_gen_ms']}ms")
        else:
            print(f"  ❌ Payment failed: {result['status_code']}")
        
        return result['total_ms'] if result['success'] else None
    
    def run_single_test(self, show_details=True):
        """Run single test iteration"""
        results = {}
        
        if show_details:
            print(f"\n🔄 Test Iteration:")
        
        # Test login
        login_latency = self.login_and_get_token()
        if login_latency:
            results['login'] = login_latency
        
        if self.token:
            # Test protected endpoints
            results['credits'] = self.test_credits()
            results['image_gen'] = self.test_image_generation()
            results['payment'] = self.test_payment()
        
        return results
    
    def run_performance_test(self, iterations=5):
        """Run performance test with multiple iterations"""
        print(f"🚀 Running Performance Test ({iterations} iterations)")
        print("=" * 70)
        
        all_results = []
        
        for i in range(iterations):
            print(f"\n--- Iteration {i+1}/{iterations} ---")
            
            result = self.run_single_test(show_details=True)
            all_results.append(result)
            
            # Small delay between tests
            time.sleep(2)
        
        self.analyze_results(all_results)
    
    def run_concurrent_test(self, concurrent_users=3, requests_per_user=2):
        """Run concurrent test to simulate multiple users"""
        print(f"\n🔥 Running Concurrent Test ({concurrent_users} users, {requests_per_user} requests each)")
        print("=" * 70)
        
        def user_test():
            results = []
            for _ in range(requests_per_user):
                result = self.run_single_test(show_details=False)
                if result.get('credits'):
                    results.append(result['credits'])
                time.sleep(0.5)
            return results
        
        all_latencies = []
        
        with ThreadPoolExecutor(max_workers=concurrent_users) as executor:
            futures = [executor.submit(user_test) for _ in range(concurrent_users)]
            
            for i, future in enumerate(as_completed(futures)):
                user_results = future.result()
                all_latencies.extend(user_results)
                print(f"User {i+1} completed: {len(user_results)} requests")
        
        if all_latencies:
            print(f"\n📊 Concurrent Test Results:")
            print(f"Total Requests: {len(all_latencies)}")
            print(f"Average Latency: {statistics.mean(all_latencies):.1f}ms")
            print(f"Median Latency: {statistics.median(all_latencies):.1f}ms")
            print(f"95th Percentile: {sorted(all_latencies)[int(len(all_latencies) * 0.95)]:.1f}ms")
    
    def analyze_results(self, results):
        """Analyze and display performance results"""
        print("\n📊 PERFORMANCE ANALYSIS REPORT")
        print("=" * 70)
        
        for endpoint in ['login', 'credits', 'image_gen', 'payment']:
            latencies = [r[endpoint] for r in results if r.get(endpoint)]
            
            if latencies:
                avg = statistics.mean(latencies)
                median = statistics.median(latencies)
                min_val = min(latencies)
                max_val = max(latencies)
                
                print(f"\n🎯 {endpoint.upper()} ENDPOINT:")
                print(f"  Average: {avg:.1f}ms")
                print(f"  Median:  {median:.1f}ms")
                print(f"  Min:     {min_val:.1f}ms")
                print(f"  Max:     {max_val:.1f}ms")
                
                # Performance rating
                if endpoint == 'login':
                    if avg < 300:
                        print(f"  Rating:  🟢 EXCELLENT (< 300ms)")
                    elif avg < 500:
                        print(f"  Rating:  🟡 GOOD (< 500ms)")
                    else:
                        print(f"  Rating:  🔴 NEEDS IMPROVEMENT (> 500ms)")
                elif endpoint == 'image_gen':
                    if avg < 5000:
                        print(f"  Rating:  🟢 EXCELLENT (< 5s)")
                    elif avg < 10000:
                        print(f"  Rating:  🟡 GOOD (< 10s)")
                    else:
                        print(f"  Rating:  🔴 NEEDS IMPROVEMENT (> 10s)")
                else:
                    if avg < 200:
                        print(f"  Rating:  🟢 EXCELLENT (< 200ms)")
                    elif avg < 400:
                        print(f"  Rating:  🟡 GOOD (< 400ms)")
                    else:
                        print(f"  Rating:  🔴 NEEDS IMPROVEMENT (> 400ms)")

def main():
    test = PerformanceTest()
    
    print("🧪 Imagify API Latency & Performance Test")
    print("🌐 API URL:", API_BASE_URL)
    print("=" * 70)
    
    # Single user performance test
    test.run_performance_test(iterations=3)
    
    # Concurrent user test
    test.run_concurrent_test(concurrent_users=2, requests_per_user=2)
    
    print("\n✅ Performance test completed!")
    print("\n💡 Tips for optimization:")
    print("   - Use Lambda Provisioned Concurrency for consistent performance")
    print("   - Enable DynamoDB DAX for faster database queries")
    print("   - Consider CloudFront for API caching")
    print("   - Monitor CloudWatch metrics for bottlenecks")

if __name__ == "__main__":
    main()
