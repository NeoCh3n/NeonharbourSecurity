import React, { useState } from 'react';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Table,
  Badge,
  Button,
  Modal,
  FormField,
  Select,
  StatusIndicator
} from '@cloudscape-design/components';
import type { TableProps, SelectProps } from '@cloudscape-design/components';
import { useAuth, USER_ROLES, PERMISSIONS } from '../hooks/useAuth';
import { useApiClient } from '../lib/api';

interface User {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  createdAt: string;
  lastSignInAt?: string;
  banned: boolean;
}

const ROLE_OPTIONS: SelectProps.Option[] = [
  { label: 'Admin', value: USER_ROLES.ADMIN },
  { label: 'Analyst', value: USER_ROLES.ANALYST },
  { label: 'Viewer', value: USER_ROLES.VIEWER },
  { label: 'Demo User', value: USER_ROLES.DEMO_USER }
];

export function RoleManagement() {
  const { hasPermission } = useAuth();
  const apiClient = useApiClient();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRole, setNewRole] = useState<SelectProps.Option | null>(null);
  const [updating, setUpdating] = useState(false);

  const loadUsers = async () => {
    if (!hasPermission(PERMISSIONS.MANAGE_USERS)) return;
    
    setLoading(true);
    try {
      const response = await apiClient.get<{ users: User[] }>('/admin/users');
      setUsers(response.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async () => {
    if (!selectedUser || !newRole) return;
    
    setUpdating(true);
    try {
      await apiClient.patch(`/admin/users/${selectedUser.id}/role`, {
        role: newRole.value
      });
      
      // Update local state
      setUsers(prev => prev.map(user => 
        user.id === selectedUser.id 
          ? { ...user, role: newRole.value as string }
          : user
      ));
      
      setShowRoleModal(false);
      setSelectedUser(null);
      setNewRole(null);
    } catch (error) {
      console.error('Failed to update user role:', error);
    } finally {
      setUpdating(false);
    }
  };

  const columnDefinitions: TableProps.ColumnDefinition<User>[] = [
    {
      id: 'email',
      header: 'Email',
      cell: (user) => user.email || '—'
    },
    {
      id: 'name',
      header: 'Name',
      cell: (user) => `${user.firstName || ''} ${user.lastName || ''}`.trim() || '—'
    },
    {
      id: 'role',
      header: 'Role',
      cell: (user) => (
        <Badge color={
          user.role === USER_ROLES.ADMIN ? 'red' :
          user.role === USER_ROLES.ANALYST ? 'blue' :
          user.role === USER_ROLES.DEMO_USER ? 'grey' : 'green'
        }>
          {user.role}
        </Badge>
      )
    },
    {
      id: 'status',
      header: 'Status',
      cell: (user) => (
        <StatusIndicator type={user.banned ? 'error' : 'success'}>
          {user.banned ? 'Banned' : 'Active'}
        </StatusIndicator>
      )
    },
    {
      id: 'lastSignIn',
      header: 'Last Sign In',
      cell: (user) => user.lastSignInAt 
        ? new Date(user.lastSignInAt).toLocaleDateString()
        : '—'
    }
  ];

  React.useEffect(() => {
    loadUsers();
  }, []);

  if (!hasPermission(PERMISSIONS.MANAGE_USERS)) {
    return (
      <Container header={<Header variant="h3">Role Management</Header>}>
        <StatusIndicator type="error">
          Insufficient permissions to manage users
        </StatusIndicator>
      </Container>
    );
  }

  return (
    <>
      <Container 
        header={
          <Header 
            variant="h3"
            actions={
              <Button onClick={loadUsers} loading={loading}>
                Refresh
              </Button>
            }
          >
            Role Management
          </Header>
        }
      >
        <Table
          items={users}
          columnDefinitions={columnDefinitions}
          loading={loading}
          loadingText="Loading users..."
          empty={<Box>No users found</Box>}
          selectionType="single"
          onSelectionChange={({ detail }) => {
            const user = detail.selectedItems[0];
            if (user) {
              setSelectedUser(user);
              setNewRole(ROLE_OPTIONS.find(opt => opt.value === user.role) || null);
              setShowRoleModal(true);
            }
          }}
        />
      </Container>

      <Modal
        visible={showRoleModal}
        onDismiss={() => setShowRoleModal(false)}
        header="Update User Role"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setShowRoleModal(false)}>
                Cancel
              </Button>
              <Button 
                variant="primary" 
                onClick={updateUserRole}
                loading={updating}
                disabled={!newRole}
              >
                Update Role
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        {selectedUser && (
          <SpaceBetween size="m">
            <Box>
              <Box variant="awsui-key-label">User</Box>
              <Box variant="p">{selectedUser.email}</Box>
            </Box>
            
            <FormField label="New Role">
              <Select
                selectedOption={newRole}
                onChange={({ detail }) => setNewRole(detail.selectedOption)}
                options={ROLE_OPTIONS}
                placeholder="Select a role"
              />
            </FormField>
          </SpaceBetween>
        )}
      </Modal>
    </>
  );
}