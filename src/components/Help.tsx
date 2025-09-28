import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  ArrowLeft,
  HelpCircle,
  MessageCircle,
  Mail,
  Phone,
  FileText,
  BookOpen,
  Video,
  Download,
  ExternalLink,
  Send,
  CheckCircle,
  Clock,
  AlertCircle,
  Users,
  Zap,
  Shield,
  Database,
  Settings
} from 'lucide-react';

interface HelpProps {
  onBack: () => void;
}

export function Help({ onBack }: HelpProps) {
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    subject: '',
    priority: 'medium',
    category: 'general',
    message: ''
  });

  const [feedbackForm, setFeedbackForm] = useState({
    type: 'feature',
    title: '',
    description: '',
    rating: 5
  });

  const [submitted, setSubmitted] = useState(false);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    // Simulate form submission
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    // Simulate form submission
    setTimeout(() => setSubmitted(false), 3000);
  };

  const quickActions = [
    {
      title: 'Emergency Support',
      description: 'Critical security incidents requiring immediate attention',
      icon: <AlertCircle className="h-5 w-5 text-red-400" />,
      action: 'Call +852 5316 8175',
      urgent: true
    },
    {
      title: 'Technical Support',
      description: 'Get help with platform configuration and troubleshooting',
      icon: <Settings className="h-5 w-5 text-blue-400" />,
      action: 'Open Support Ticket',
      urgent: false
    },
    {
      title: 'Training Request',
      description: 'Schedule training sessions for your security team',
      icon: <Users className="h-5 w-5 text-purple-400" />,
      action: 'Book Training',
      urgent: false
    },
    {
      title: 'Integration Help',
      description: 'Assistance with AWS and third-party integrations',
      icon: <Database className="h-5 w-5 text-cyan-400" />,
      action: 'Contact Specialist',
      urgent: false
    }
  ];

  const documentation = [
    {
      title: 'Getting Started Guide',
      description: 'Complete setup and configuration walkthrough',
      icon: <BookOpen className="h-5 w-5 text-green-400" />,
      type: 'Guide',
      url: '#'
    },
    {
      title: 'API Documentation',
      description: 'Comprehensive API reference and examples',
      icon: <FileText className="h-5 w-5 text-blue-400" />,
      type: 'API',
      url: '#'
    },
    {
      title: 'Security Best Practices',
      description: 'HKMA compliance and security recommendations',
      icon: <Shield className="h-5 w-5 text-yellow-400" />,
      type: 'Security',
      url: '#'
    },
    {
      title: 'Video Tutorials',
      description: 'Step-by-step video guides for all features',
      icon: <Video className="h-5 w-5 text-purple-400" />,
      type: 'Video',
      url: '#'
    },
    {
      title: 'Troubleshooting Guide',
      description: 'Common issues and their solutions',
      icon: <Zap className="h-5 w-5 text-orange-400" />,
      type: 'Support',
      url: '#'
    },
    {
      title: 'Release Notes',
      description: 'Latest updates and feature announcements',
      icon: <Download className="h-5 w-5 text-cyan-400" />,
      type: 'Updates',
      url: '#'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-slate-300 hover:text-white hover:bg-slate-700/50"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center space-x-2">
            <HelpCircle className="h-6 w-6 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">Help & Support</h1>
          </div>
        </div>

        {submitted && (
          <Card className="mb-6 bg-green-500/10 border-green-500/30 shadow-lg shadow-slate-900/20">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <p className="text-green-400 font-medium">
                  Your request has been submitted successfully. Our team will respond within 24 hours.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-slate-800/50 border-slate-700">
            <TabsTrigger value="overview" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Overview
            </TabsTrigger>
            <TabsTrigger value="contact" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Contact Support
            </TabsTrigger>
            <TabsTrigger value="feedback" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Send Feedback
            </TabsTrigger>
            <TabsTrigger value="documentation" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Documentation
            </TabsTrigger>
            <TabsTrigger value="resources" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              Resources
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white flex items-center space-x-2">
                  <MessageCircle className="h-5 w-5 text-blue-400" />
                  <span>How can we help you?</span>
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Choose from the quick actions below or explore our comprehensive support options
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {quickActions.map((action, index) => (
                    <Card key={index} className={`bg-slate-700/30 border-slate-600 hover:bg-slate-700/50 transition-colors cursor-pointer ${action.urgent ? 'border-l-4 border-l-red-500' : ''}`}>
                      <CardContent className="pt-6">
                        <div className="flex items-start space-x-3">
                          {action.icon}
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h3 className="font-medium text-white">{action.title}</h3>
                              {action.urgent && (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                                  Urgent
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-400 mb-3">{action.description}</p>
                            <Button size="sm" className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600">
                              {action.action}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white">Contact Information</CardTitle>
                <CardDescription className="text-slate-300">
                  Multiple ways to reach our support team
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex items-center space-x-3">
                    <Phone className="h-5 w-5 text-green-400" />
                    <div>
                      <p className="text-white font-medium">Emergency Hotline</p>
                      <p className="text-slate-400">+852 5316 8175</p>
                      <p className="text-xs text-slate-500">24/7 for critical incidents</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Mail className="h-5 w-5 text-blue-400" />
                    <div>
                      <p className="text-white font-medium">Support Email</p>
                      <p className="text-slate-400">support@neoharbor.hk</p>
                      <p className="text-xs text-slate-500">Response within 4 hours</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Clock className="h-5 w-5 text-purple-400" />
                    <div>
                      <p className="text-white font-medium">Business Hours</p>
                      <p className="text-slate-400">Mon-Fri 9:00-18:00</p>
                      <p className="text-xs text-slate-500">Hong Kong Time (GMT+8)</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contact Support Tab */}
          <TabsContent value="contact" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white">Contact Support Team</CardTitle>
                <CardDescription className="text-slate-300">
                  Submit a support request and our team will get back to you promptly
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleContactSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-slate-300">Full Name</Label>
                      <Input
                        id="name"
                        value={contactForm.name}
                        onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                        className="bg-slate-700/50 border-slate-600 text-white"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-slate-300">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                        className="bg-slate-700/50 border-slate-600 text-white"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="category" className="text-slate-300">Category</Label>
                      <select
                        id="category"
                        value={contactForm.category}
                        onChange={(e) => setContactForm(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-md text-white"
                      >
                        <option value="general">General Support</option>
                        <option value="technical">Technical Issue</option>
                        <option value="billing">Billing & Account</option>
                        <option value="integration">Integration Help</option>
                        <option value="training">Training Request</option>
                        <option value="security">Security Incident</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="priority" className="text-slate-300">Priority</Label>
                      <select
                        id="priority"
                        value={contactForm.priority}
                        onChange={(e) => setContactForm(prev => ({ ...prev, priority: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-md text-white"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subject" className="text-slate-300">Subject</Label>
                      <Input
                        id="subject"
                        value={contactForm.subject}
                        onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                        className="bg-slate-700/50 border-slate-600 text-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-slate-300">Message</Label>
                    <Textarea
                      id="message"
                      value={contactForm.message}
                      onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                      className="bg-slate-700/50 border-slate-600 text-white min-h-32"
                      placeholder="Please describe your issue or request in detail..."
                      required
                    />
                  </div>

                  <Button type="submit" className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600">
                    <Send className="h-4 w-4 mr-2" />
                    Submit Support Request
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Feedback Tab */}
          <TabsContent value="feedback" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white">Send Feedback</CardTitle>
                <CardDescription className="text-slate-300">
                  Help us improve NeoHarbor Security with your valuable feedback
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFeedbackSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="feedback-type" className="text-slate-300">Feedback Type</Label>
                      <select
                        id="feedback-type"
                        value={feedbackForm.type}
                        onChange={(e) => setFeedbackForm(prev => ({ ...prev, type: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-md text-white"
                      >
                        <option value="feature">Feature Request</option>
                        <option value="improvement">Improvement Suggestion</option>
                        <option value="bug">Bug Report</option>
                        <option value="usability">Usability Feedback</option>
                        <option value="performance">Performance Issue</option>
                        <option value="general">General Feedback</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="feedback-title" className="text-slate-300">Title</Label>
                      <Input
                        id="feedback-title"
                        value={feedbackForm.title}
                        onChange={(e) => setFeedbackForm(prev => ({ ...prev, title: e.target.value }))}
                        className="bg-slate-700/50 border-slate-600 text-white"
                        placeholder="Brief description of your feedback"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="feedback-description" className="text-slate-300">Description</Label>
                    <Textarea
                      id="feedback-description"
                      value={feedbackForm.description}
                      onChange={(e) => setFeedbackForm(prev => ({ ...prev, description: e.target.value }))}
                      className="bg-slate-700/50 border-slate-600 text-white min-h-32"
                      placeholder="Please provide detailed feedback..."
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Overall Satisfaction</Label>
                    <div className="flex items-center space-x-4">
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <button
                          key={rating}
                          type="button"
                          onClick={() => setFeedbackForm(prev => ({ ...prev, rating }))}
                          className={`w-8 h-8 rounded-full border-2 ${
                            feedbackForm.rating >= rating
                              ? 'bg-yellow-400 border-yellow-400'
                              : 'border-slate-600 hover:border-slate-500'
                          }`}
                        >
                          <span className="text-sm font-medium">
                            {feedbackForm.rating >= rating ? '★' : '☆'}
                          </span>
                        </button>
                      ))}
                      <span className="text-slate-400 ml-2">
                        {feedbackForm.rating}/5 stars
                      </span>
                    </div>
                  </div>

                  <Button type="submit" className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600">
                    <Send className="h-4 w-4 mr-2" />
                    Submit Feedback
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documentation Tab */}
          <TabsContent value="documentation" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white">Documentation & Guides</CardTitle>
                <CardDescription className="text-slate-300">
                  Comprehensive resources to help you make the most of NeoHarbor Security
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {documentation.map((doc, index) => (
                    <Card key={index} className="bg-slate-700/30 border-slate-600 hover:bg-slate-700/50 transition-colors cursor-pointer">
                      <CardContent className="pt-6">
                        <div className="flex items-start space-x-3">
                          {doc.icon}
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h3 className="font-medium text-white">{doc.title}</h3>
                              <Badge className="bg-slate-600/50 text-slate-300 text-xs">
                                {doc.type}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-400 mb-3">{doc.description}</p>
                            <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Resources Tab */}
          <TabsContent value="resources" className="space-y-4">
            <Card className="bg-slate-800/50 backdrop-blur-sm border-slate-700 shadow-lg shadow-slate-900/20">
              <CardHeader>
                <CardTitle className="text-white">Additional Resources</CardTitle>
                <CardDescription className="text-slate-300">
                  Tools and resources for security professionals
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-white font-medium mb-3">Training Resources</h3>
                    <div className="space-y-2">
                      <Button variant="outline" className="w-full justify-start border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                        <Video className="h-4 w-4 mr-2" />
                        Platform Onboarding Course
                      </Button>
                      <Button variant="outline" className="w-full justify-start border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                        <BookOpen className="h-4 w-4 mr-2" />
                        HKMA Compliance Training
                      </Button>
                      <Button variant="outline" className="w-full justify-start border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                        <Shield className="h-4 w-4 mr-2" />
                        Advanced Threat Analysis
                      </Button>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white font-medium mb-3">Community</h3>
                    <div className="space-y-2">
                      <Button variant="outline" className="w-full justify-start border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                        <Users className="h-4 w-4 mr-2" />
                        User Community Forum
                      </Button>
                      <Button variant="outline" className="w-full justify-start border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Security Best Practices
                      </Button>
                      <Button variant="outline" className="w-full justify-start border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/50">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Industry Resources
                      </Button>
                    </div>
                  </div>
                </div>
                
                <Separator className="bg-slate-700" />
                
                <div>
                  <h3 className="text-white font-medium mb-3">System Status</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                      <div className="flex items-center space-x-2 mb-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        <span className="text-sm font-medium text-white">All Systems Operational</span>
                      </div>
                      <p className="text-xs text-slate-400">Last updated: 2 minutes ago</p>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                      <div className="flex items-center space-x-2 mb-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        <span className="text-sm font-medium text-white">API Performance: 99.9%</span>
                      </div>
                      <p className="text-xs text-slate-400">Average response: 45ms</p>
                    </div>
                    <div className="p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                      <div className="flex items-center space-x-2 mb-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        <span className="text-sm font-medium text-white">Data Processing: Normal</span>
                      </div>
                      <p className="text-xs text-slate-400">Processing 1.2M events/min</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}