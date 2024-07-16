import React, {} from 'react';
import { Outlet } from 'react-router-dom'
import {
  TopNavigation,
  AppLayout,
  ContentLayout,
  SideNavigation,
} from '@cloudscape-design/components';

import { AuthUser } from 'aws-amplify/auth';

interface MainComponentProps {
  signOut: Function | undefined;
  user: AuthUser | undefined;
}

const MainComponent: React.FC<MainComponentProps> = (props) => {

  const clickSignOut = () => {
    if (props.signOut) {
      props.signOut();
    }
  }

  return (
    <>
      <TopNavigation
        identity={{
          href: "/",
          title: "AWS Shorts",
        }}
        utilities={[
          {
            type: "menu-dropdown",
            text: props.user?.signInDetails?.loginId,
            description: props.user?.signInDetails?.loginId,
            iconName: "user-profile",
            items: [
              { id: "signOut", text: "Sign out" }
            ],
            onItemClick: clickSignOut
          }
        ]}
      />
      <AppLayout
        toolsHide={true}
        navigation={
          <SideNavigation
            header={{
              href: '#',
              text: 'AWS Shorts',
            }}
            items={[
              { type: 'link', text: `Create New Shorts`, href: `/` },
              { type: 'link', text: `Shorts History`, href: `/history` },
            ]}
          />
        }
        content={
          <ContentLayout>
            <Outlet />
          </ContentLayout>
        }
      />
    </>
  );
};

export default MainComponent;
