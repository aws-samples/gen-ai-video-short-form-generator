import React, {} from 'react';
import {Flashbar } from '@cloudscape-design/components';


const InProgressComponent: React.FC = () => {

  return (

        <Flashbar
          items={[
          {
              type: "in-progress",
              loading: true,
              content: "in progresss",
          }
          ]}
        />

  );
};

export default InProgressComponent;
